"""
Deal pipeline — orchestrates the full Phase 3 intelligence flow.

For each (origin, destination, cabin, date) after a scan:
  1. Cross-reference available source results
  2. Pull rolling statistics from TimescaleDB
  3. Score the deal (all components)
  4. If force_enrich=True: always enrich with Duffel + Seats.aero
     (force_enrich=True on daily 7 AM enrichment scan and "Scan Now" button)
  5. Re-score with enrichment data
  6. Generate AI recommendation
  7. Store DealAnalysis row
  8. Store FlightOffer rows (linked to DealAnalysis via deal_analysis_id)
  9. Return scored deal for WebSocket broadcast

Enrichment is NOT score-gated. Score quality improves as historical data accumulates.
"""
import uuid
import structlog
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert

from app.models.deal import DealAnalysis
from app.services.cross_reference import cross_reference
from app.services.stats import get_daily_stats, get_price_slope_7d
from app.services.scoring import score_deal
from app.services.award_analyzer import enrich_awards, best_award_summary
from app.services import duffel_client, seats_aero_client
from app.services.ingestion import store_duffel_price, store_award_prices, store_flight_offers
from app.services import claude_advisor

logger = structlog.get_logger(__name__)


async def run_pipeline(
    route_id: uuid.UUID,
    origin: str,
    destination: str,
    departure_date: date,
    cabin_class: str,
    google_result: dict[str, Any] | None,
    db: AsyncSession,
    user_language: str = "en",
    force_enrich: bool = False,
    offers: list[dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    """
    Full intelligence pipeline for one (origin, dest, cabin, date) combo.

    force_enrich=True  → always call Duffel + Seats.aero (daily 7 AM / Scan Now)
    force_enrich=False → SerpApi 4h quick scan, no enrichment
    offers             → individual flight offers from SerpApi for this combo (stored as FlightOffers)

    Returns the final scored deal dict, or None if no price found.
    """
    # ── Step 1: Cross-reference ────────────────────────────────────────────────
    xref = cross_reference(google_result=google_result)

    if not xref["best_price_usd"]:
        logger.debug("pipeline_no_price", origin=origin, destination=destination,
                     cabin=cabin_class, date=str(departure_date))
        return None

    # ── Step 2: Rolling statistics ─────────────────────────────────────────────
    stats = await get_daily_stats(db, route_id, origin, destination, cabin_class)
    slope = await get_price_slope_7d(db, route_id, origin, destination, cabin_class)

    # ── Step 3: First-pass score ───────────────────────────────────────────────
    first_score = score_deal(
        xref=xref,
        google_result=google_result,
        daily_stats=stats,
        duffel_result=None,
        award_results=None,
        extra={"price_slope_7d": slope},
    )

    # ── Step 4: Enrichment (Duffel + Seats.aero) ─────────────────────────────
    duffel_result = None
    enriched_awards: list = []

    if force_enrich:
        logger.info("pipeline_enriching", force=True,
                    origin=origin, destination=destination, cabin=cabin_class)

        duffel_result = await duffel_client.enrich_offer(
            origin, destination, departure_date, cabin_class
        )
        if duffel_result:
            await store_duffel_price(route_id, duffel_result, db)
            xref["sources_confirmed"].append("duffel")

        raw_awards = await seats_aero_client.search_award_availability(
            origin, destination, departure_date, cabin_class
        )
        if raw_awards:
            await store_award_prices(route_id, raw_awards, db)
            enriched_awards = enrich_awards(xref["best_price_usd"], raw_awards)

    # ── Step 5: Final score with enrichment data ───────────────────────────────
    final_score = score_deal(
        xref=xref,
        google_result=google_result,
        daily_stats=stats,
        duffel_result=duffel_result,
        award_results=enriched_awards or None,
        extra={"price_slope_7d": slope},
    )

    # ── Step 6: AI recommendation (BUY/STRONG_BUY/GEM only) ──────────────────
    deal_context = {**final_score, **xref,
                    "origin": origin, "destination": destination,
                    "cabin_class": cabin_class, "departure_date": str(departure_date)}

    ai_en, ai_pt = None, None
    if final_score["action"] in ("STRONG_BUY", "BUY") or final_score["is_gem"]:
        ai_en = await claude_advisor.generate_recommendation(deal_context, language="en")
        ai_pt = await claude_advisor.generate_recommendation(deal_context, language="pt")

    # ── Step 7: Award summary ──────────────────────────────────────────────────
    award_summary = best_award_summary(enriched_awards)

    # ── Step 8: Store DealAnalysis ────────────────────────────────────────────
    now = datetime.now(timezone.utc)
    deal_id = uuid.uuid4()
    row = {
        "time":              now,
        "id":                deal_id,
        "route_id":          route_id,
        "origin":            origin,
        "destination":       destination,
        "departure_date":    departure_date,
        "cabin_class":       cabin_class,
        "best_price_usd":    xref["best_price_usd"],
        "best_source":       xref["best_source"],
        "airline_code":      (xref["airline_codes"] or [None])[0],
        "is_direct":         google_result.get("is_direct", False) if google_result else False,
        "typical_price_low":  google_result.get("typical_price_low") if google_result else None,
        "typical_price_high": google_result.get("typical_price_high") if google_result else None,
        **final_score,
        "sources_confirmed": xref["sources_confirmed"],
        "ai_recommendation_en": ai_en,
        "ai_recommendation_pt": ai_pt,
        **award_summary,
        "alert_sent":        False,
    }

    stmt = insert(DealAnalysis).values([row]).on_conflict_do_nothing()
    await db.execute(stmt)
    await db.commit()

    # ── Step 9: Store FlightOffers (linked to this DealAnalysis) ─────────────
    if offers:
        await store_flight_offers(route_id, offers, deal_id, db)

    logger.info(
        "pipeline_complete",
        origin=origin, destination=destination, cabin=cabin_class,
        price=xref["best_price_usd"], score=final_score["score_total"],
        action=final_score["action"], enriched=force_enrich,
        offers_stored=len(offers) if offers else 0,
    )

    return {**row, "id": str(deal_id)}


async def run_pipeline_batch(
    route_id: uuid.UUID,
    scan_results: dict[str, Any],
    db: AsyncSession,
    user_language: str = "en",
    force_enrich: bool = False,
) -> list[dict[str, Any]]:
    """
    Runs the pipeline for all (origin, dest, cabin, date) combos from a scan result.
    Returns list of scored deals.

    scan_results["all_offers"] is a string-keyed dict: "origin|dest|cabin|date" → [offers]
    """
    all_offers_map: dict[str, list] = scan_results.get("all_offers", {})
    deals = []

    for best in scan_results.get("best_prices", []):
        combo_key = f"{best['origin']}|{best['destination']}|{best['cabin_class']}|{best['departure_date']}"
        offers = all_offers_map.get(combo_key, [])

        result = await run_pipeline(
            route_id=route_id,
            origin=best["origin"],
            destination=best["destination"],
            departure_date=date.fromisoformat(best["departure_date"]),
            cabin_class=best["cabin_class"],
            google_result={
                "price_usd":          best["price_usd"],
                "price_level":        best.get("price_level"),
                "airline_codes":      best.get("airline_codes", []),
                "typical_price_low":  best.get("typical_price_low"),
                "typical_price_high": best.get("typical_price_high"),
                "is_direct":          best.get("is_direct", False),
                "price_history":      None,
            },
            db=db,
            user_language=user_language,
            force_enrich=force_enrich,
            offers=offers,
        )
        if result:
            deals.append(result)

    return deals
