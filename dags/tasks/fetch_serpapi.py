"""
Airflow task: fetch SerpApi (Google Flights) data.
Pushes XCom: google_result (dict | None).

scan_mode controls date selection (Plan v3 budget gating):
  - "quick" : 3 dates only (the cheapest 3 from history, fallback first/middle/last)
              fired by the every-4h tripwire DAG. deep=False.
  - "full"  : all dates in window, capped at 11. fired 3x/day. deep=True.
  - "daily" : all dates + force_enrich (Duffel + Seats.aero). fired 1x/day @ 7am.
"""
import asyncio
import logging
from datetime import date, datetime, timezone, timedelta
import uuid

log = logging.getLogger(__name__)

MAX_FULL_DATES = 11
QUICK_SAMPLE_COUNT = 3


def run(route_id: str, origins: list[str], destinations: list[str],
        cabin_class: str, deep: bool = True, scan_mode: str = "full", **context) -> None:
    asyncio.run(_async_run(route_id, origins, destinations, cabin_class, deep, scan_mode, context))


def _select_dates(date_from: date, date_to: date, scan_mode: str,
                  cheapest_known: list[date] | None = None) -> list[date]:
    total_days = (date_to - date_from).days + 1
    all_dates = [date_from + timedelta(days=i) for i in range(total_days)]

    if scan_mode == "quick":
        if cheapest_known:
            picks = [d for d in cheapest_known if date_from <= d <= date_to][:QUICK_SAMPLE_COUNT]
            if picks:
                return picks
        # Fallback: first / middle / last
        if total_days <= QUICK_SAMPLE_COUNT:
            return all_dates
        return [all_dates[0], all_dates[total_days // 2], all_dates[-1]]

    # full / daily — cap at MAX_FULL_DATES to protect the budget
    if total_days <= MAX_FULL_DATES:
        return all_dates
    step = max(1, total_days // MAX_FULL_DATES)
    sampled = [all_dates[i] for i in range(0, total_days, step)][:MAX_FULL_DATES]
    if sampled[-1] != all_dates[-1]:
        sampled.append(all_dates[-1])
    return sampled


async def _cheapest_known_dates(db, route_id: uuid.UUID, cabin_class: str,
                                limit: int = QUICK_SAMPLE_COUNT) -> list[date]:
    """Pull the cheapest known departure_dates from deal_analysis (last 30d)."""
    from sqlalchemy import text
    try:
        res = await db.execute(
            text("""
                SELECT departure_date, MIN(best_price_usd) AS p
                FROM deal_analysis
                WHERE route_id = :rid
                  AND cabin_class = :cab
                  AND time >= NOW() - INTERVAL '30 days'
                  AND departure_date >= CURRENT_DATE
                GROUP BY departure_date
                ORDER BY p ASC
                LIMIT :lim
            """),
            {"rid": str(route_id), "cab": cabin_class, "lim": limit},
        )
        return [row[0] for row in res.fetchall() if row[0]]
    except Exception as exc:
        log.warning("cheapest_known_dates lookup failed: %s", exc)
        return []


async def _async_run(route_id: str, origins: list[str], destinations: list[str],
                     cabin_class: str, deep: bool, scan_mode: str, context: dict) -> None:
    from app.services import serpapi_client
    from app.services.ingestion import store_google_price
    from app.database import AsyncSessionLocal
    from sqlalchemy import select
    from app.models.route import Route

    ti = context["ti"]
    best_result = None

    async with AsyncSessionLocal() as db:
        try:
            res = await db.execute(select(Route).where(Route.id == uuid.UUID(route_id)))
            route = res.scalar_one_or_none()
        except Exception:
            route = None

        if route and getattr(route, "date_from", None):
            date_from = route.date_from
            date_to = route.date_to or date_from
        else:
            date_from = date.today()
            date_to = date_from

        cheapest = await _cheapest_known_dates(db, uuid.UUID(route_id), cabin_class) if scan_mode == "quick" else []
        dates_to_scan = _select_dates(date_from, date_to, scan_mode, cheapest)

        log.info("serpapi_scan: route=%s cabin=%s mode=%s dates=%d (deep=%s)",
                 route_id, cabin_class, scan_mode, len(dates_to_scan), deep)

        for departure in dates_to_scan:
            for origin in origins:
                for dest in destinations:
                    # Build prefs dict from saved route when available
                    route_prefs = {}
                    if route:
                        route_prefs = {
                            "max_budget_usd": getattr(route, "max_budget_usd", None),
                            "outbound_time_window": getattr(route, "outbound_time_window", None),
                            "return_time_window": getattr(route, "return_time_window", None),
                            "preferred_airlines": getattr(route, "preferred_airlines", None),
                            "excluded_airlines": getattr(route, "excluded_airlines", None),
                            "max_stops": getattr(route, "max_stops", None),
                            "max_layover_minutes": getattr(route, "max_layover_minutes", None),
                            "excluded_connection_airports": getattr(route, "excluded_connection_airports", None),
                            "max_total_duration_minutes": getattr(route, "max_total_duration_minutes", None),
                            "low_carbon_only": getattr(route, "low_carbon_only", None),
                            "preferred_award_programs": getattr(route, "preferred_award_programs", None),
                            "passengers": getattr(route, "passengers", None),
                            "currency": getattr(route, "currency", None),
                        }

                    result = await serpapi_client.search_flights(
                        origin, dest, departure, cabin_class, deep=deep, prefs=route_prefs
                    )
                    if not result or not result.get("price_usd"):
                        continue
                    if best_result is None or result["price_usd"] < best_result["price_usd"]:
                        best_result = result
                    await store_google_price(uuid.UUID(route_id), result, db)

    # Push enrichment hint for branch_action downstream
    ti.xcom_push(key="scan_mode", value=scan_mode)
    ti.xcom_push(key="force_enrich", value=(scan_mode == "daily"))

    if best_result:
        ti.xcom_push(key="google_result", value={
            "price_usd":          best_result["price_usd"],
            "price_level":        best_result.get("price_level"),
            "typical_price_low":  best_result.get("typical_price_low"),
            "typical_price_high": best_result.get("typical_price_high"),
            "price_history":      best_result.get("price_history"),
            "airline_codes":      best_result.get("airline_codes", []),
            "origin":             best_result["origin"],
            "destination":        best_result["destination"],
        })
    else:
        ti.xcom_push(key="google_result", value=None)
        log.warning("serpapi: no results for route %s", route_id)
