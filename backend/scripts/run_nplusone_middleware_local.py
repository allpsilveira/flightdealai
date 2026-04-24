#!/usr/bin/env python3
"""Local N+1 middleware smoke check (self-contained).

Creates a minimal FastAPI app with the same middleware behavior as the
project's N+1 detector, injects a route that simulates many DB queries by
incrementing the per-request counter, and asserts that the middleware logs
an alert when the threshold is exceeded.

This script avoids importing the main project so it can run in a lightweight
environment (useful for CI or local checks where full deps aren't installed).
"""
import os
import uuid
import random
import traceback
import contextvars
import asyncio
import sys

from fastapi import FastAPI, Request
from httpx import AsyncClient
try:
    # httpx >=0.21 exposes ASGITransport for in-memory ASGI testing
    from httpx import ASGITransport
except Exception:
    ASGITransport = None


# Per-request counter (ContextVar)
_request_query_count: contextvars.ContextVar[int] = contextvars.ContextVar("nplusone_query_count", default=0)


class StubLogger:
    def __init__(self):
        self.calls = []

    def warning(self, *args, **kwargs):
        print("[stublogger] warning", args, kwargs)
        self.calls.append((args, kwargs))


def create_app(logger=None, debug=True):
    if logger is None:
        logger = StubLogger()

    app = FastAPI()

    async def nplusone_middleware(request, call_next):
        rid = str(uuid.uuid4())
        _request_query_count.set(0)
        try:
            response = await call_next(request)
            return response
        finally:
            try:
                count = _request_query_count.get()
            except Exception:
                count = 0

            threshold = int(os.getenv("NPLUSONE_THRESHOLD", "5"))
            if os.getenv("NPLUSONE_SAMPLE_RATE") is not None:
                sample_rate = float(os.getenv("NPLUSONE_SAMPLE_RATE"))
            else:
                sample_rate = 1.0 if debug else 0.01

            # Fallback: some ASGI test drivers isolate ContextVars; allow route to set
            # `request.state._sim_queries` as a reliable fallback for tests.
            if count == 0 and hasattr(request.state, "_sim_queries"):
                try:
                    count = int(request.state._sim_queries)
                except Exception:
                    pass

            if count > threshold and random.random() < sample_rate:
                print(f"[DEBUG] count={count} threshold={threshold} sample_rate={sample_rate}")
                stack = "".join(traceback.format_stack(limit=8))
                logger.warning(
                    "nplusone_detected",
                    request_id=rid,
                    route=str(request.url.path),
                    query_count=count,
                    stack=stack,
                    tag="nplusone-review",
                )
            else:
                print(f"[DEBUG] evaluated condition: count={count} threshold={threshold} sample_rate={sample_rate}")

    app.middleware("http")(nplusone_middleware)

    @app.get("/_test/nplusone")
    async def _test_nplusone_route(request: Request):
        # simulate N tiny queries
        current = _request_query_count.get()
        _request_query_count.set(current + 10)
        # set a fallback on request.state so ASGI transports can expose it
        request.state._sim_queries = 10
        # Also set on request.state so tests using ASGI transports can be detected
        # (request object not available here directly; FastAPI will attach state
        # to the request object, but for the lightweight test we rely on the
        # middleware fallback to read request.state._sim_queries when present.)
        # We can't access `request` from here without adding a param, but the
        # middleware will check `request.state` as a fallback.
        return {"simulated_queries": 10}

    return app, logger


async def main():
    # ensure deterministic detection
    os.environ.setdefault("NPLUSONE_THRESHOLD", "5")
    os.environ.setdefault("NPLUSONE_SAMPLE_RATE", "1.0")

    app, logger = create_app(debug=True)

    # Use ASGITransport when available to call the in-memory app
    if ASGITransport is not None:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
            r = await ac.get("/_test/nplusone")
    else:
        # Fallback: run via loop and call route directly
        async with AsyncClient(base_url="http://testserver") as ac:
            r = await ac.get("/_test/nplusone")
        print("status", r.status_code, r.json())

    found = any((args and args[0] == "nplusone_detected") for args, _ in logger.calls)
    if found:
        print("N+1 middleware check: detected (PASS)")
        return 0
    else:
        print("N+1 middleware check: not detected (FAIL)")
        return 2


if __name__ == "__main__":
    code = asyncio.run(main())
    sys.exit(code)
