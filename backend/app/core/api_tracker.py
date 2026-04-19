"""
API usage tracker — async context manager that logs every external API call
to the api_usage_log table for cost monitoring + rate limit visibility.

Usage:
    async with track_api_call("serpapi", endpoint="google_flights", route_id=route_id) as t:
        result = await some_api.call()
        t.set_status(200)
        t.set_metadata({"results": len(result)})
"""
import time
import structlog
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.intelligence import ApiUsageLog

logger = structlog.get_logger(__name__)


# Cost estimates per call (USD)
COST_PER_CALL = {
    "serpapi":    0.025,   # $25/mo / 1000 calls = $0.025/call
    "duffel":     0.005,   # $0.005 per offer request
    "seats_aero": 0.0,     # flat $10/mo subscription, no per-call cost
    "anthropic":  0.0,     # token-based, computed separately if usage info present
}


class ApiCallTracker:
    """Mutable container the caller can update with status + metadata."""
    def __init__(self):
        self.status: int | None = None
        self.metadata: dict[str, Any] = {}
        self.cost_override: float | None = None

    def set_status(self, status: int) -> None:
        self.status = status

    def set_metadata(self, metadata: dict[str, Any]) -> None:
        self.metadata.update(metadata)

    def set_cost(self, cost_usd: float) -> None:
        self.cost_override = cost_usd


@asynccontextmanager
async def track_api_call(
    source: str,
    endpoint: str | None = None,
    route_id: UUID | None = None,
):
    """
    Async context manager that times the call and logs to api_usage_log.

    Failures in tracking NEVER raise — they're logged and swallowed so the
    real API call remains the primary concern.
    """
    tracker = ApiCallTracker()
    start = time.monotonic()
    try:
        yield tracker
    finally:
        latency_ms = int((time.monotonic() - start) * 1000)
        cost = tracker.cost_override if tracker.cost_override is not None else COST_PER_CALL.get(source, 0.0)

        try:
            async with AsyncSessionLocal() as session:
                row = ApiUsageLog(
                    timestamp=datetime.now(timezone.utc),
                    source=source,
                    endpoint=endpoint,
                    route_id=route_id,
                    response_status=tracker.status,
                    latency_ms=latency_ms,
                    cost_estimate_usd=cost,
                    usage_metadata=tracker.metadata or None,
                )
                session.add(row)
                await session.commit()
        except Exception as exc:
            logger.warning("api_tracker_log_failed", source=source, error=str(exc))
