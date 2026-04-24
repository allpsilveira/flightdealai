import os
import uuid
import random
import traceback
import contextvars
import structlog
from typing import Any

from sqlalchemy import event

from app.config import get_settings

settings = get_settings()
logger = structlog.get_logger()

# Per-request counter stored in a ContextVar so it follows the async task.
_request_query_count: contextvars.ContextVar[int] = contextvars.ContextVar("nplusone_query_count", default=0)
_request_id: contextvars.ContextVar[str | None] = contextvars.ContextVar("nplusone_request_id", default=None)


def _attach_listeners(engine) -> None:
    """Attach a before_cursor_execute listener to the SQLAlchemy engine (sync sub-engine).

    This listener increments a ContextVar counter for each SQL statement executed
    during the current request context.
    """

    def _before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        try:
            cnt = _request_query_count.get()
            _request_query_count.set(cnt + 1)
        except Exception:
            # best-effort: if ContextVar not present, ignore
            pass

    # Attach to the engine's sync_engine so both sync and async code paths are covered.
    try:
        event.listen(engine.sync_engine, "before_cursor_execute", _before_cursor_execute)
    except Exception as exc:
        logger.warning("nplusone_listener_attach_failed", error=str(exc))


def install_nplusone(app, engine) -> None:
    """Register N+1 detector middleware and DB listeners on startup.

    Middleware behaviour:
    - Initializes per-request counter and request_id
    - After response, if query count > NPLUSONE_THRESHOLD, emit a structured
      warning with abbreviated stack trace (sampling applied in prod)
    """

    _attach_listeners(engine)

    async def _nplusone_middleware(request, call_next):
        rid = str(uuid.uuid4())
        _request_id.set(rid)
        _request_query_count.set(0)

        try:
            response = await call_next(request)
            return response
        finally:
            try:
                count = _request_query_count.get()
            except Exception:
                count = 0

            threshold = int(os.getenv("NPLUSONE_THRESHOLD", "15"))
            # In dev (settings.debug==True) sample at 100%; otherwise default 1% unless overridden
            if os.getenv("NPLUSONE_SAMPLE_RATE") is not None:
                sample_rate = float(os.getenv("NPLUSONE_SAMPLE_RATE"))
            else:
                sample_rate = 1.0 if settings.debug else 0.01

            if count > threshold and random.random() < sample_rate:
                stack = "".join(traceback.format_stack(limit=8))
                logger.warning(
                    "nplusone_detected",
                    request_id=rid,
                    route=str(request.url.path),
                    query_count=count,
                    stack=stack,
                    tag="nplusone-review",
                )

            # reset for safety
            try:
                _request_query_count.set(0)
                _request_id.set(None)
            except Exception:
                pass

    # Register as HTTP middleware
    app.middleware("http")(_nplusone_middleware)
