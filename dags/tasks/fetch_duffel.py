"""
Airflow task: Duffel on-demand enrichment (Tier 3).
Only runs when score ≥ 80 or GEM. Pushes XCom: duffel_result (dict | None).
"""
import asyncio
import logging
from datetime import date
import uuid
from datetime import datetime, timezone

log = logging.getLogger(__name__)


def run(route_id: str, cabin_class: str, **context) -> None:
    asyncio.run(_async_run(route_id, cabin_class, context))


async def _async_run(route_id: str, cabin_class: str, context: dict) -> None:
    from app.services import duffel_client
    from app.database import AsyncSessionLocal
    from app.models.prices import DuffelPrice

    ti = context["ti"]

    # Pull best origin/dest from cross_reference XCom
    xref = ti.xcom_pull(task_ids="cross_reference", key="xref_summary") or {}
    origin = xref.get("origin") or xref.get("price_by_source", {})
    dest   = xref.get("destination")

    if not origin or not dest:
        log.warning("duffel: missing origin/dest from xref XCom")
        ti.xcom_push(key="duffel_result", value=None)
        return

    result = await duffel_client.enrich_offer(origin, dest, date.today(), cabin_class)
    ti.xcom_push(key="duffel_result", value={
        "fare_brand_name":           result.get("fare_brand_name") if result else None,
        "expires_at":                str(result.get("expires_at")) if result else None,
        "is_refundable":             result.get("is_refundable") if result else None,
        "price_usd":                 result.get("price_usd") if result else None,
    })

    if result:
        async with AsyncSessionLocal() as db:
            record = DuffelPrice(
                time=datetime.now(timezone.utc),
                id=uuid.uuid4(),
                route_id=uuid.UUID(route_id),
                **{k: v for k, v in result.items() if k != "raw_response"},
            )
            db.add(record)
            try:
                await db.commit()
            except Exception as exc:
                await db.rollback()
                log.error("duffel: DB write failed: %s", exc)
