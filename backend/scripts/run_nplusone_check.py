#!/usr/bin/env python3
"""Run a focused N+1 detector check against the FastAPI app.

This script:
- forces `NPLUSONE_THRESHOLD` and `NPLUSONE_SAMPLE_RATE` for deterministic detection
- injects a test route that artificially increments the per-request query counter
- calls the route via an ASGI test client and verifies that the detector logged a warning

Run from repo root:
  python backend/scripts/run_nplusone_check.py
"""
import os
import asyncio
import sys

# Ensure detection threshold is low and sampling is 100% for the test
os.environ.setdefault("NPLUSONE_THRESHOLD", "5")
os.environ.setdefault("NPLUSONE_SAMPLE_RATE", "1.0")

from app import main as app_main
from app.core import nplusone as nplusone_mod
from fastapi import Depends
from app.database import get_db
from httpx import AsyncClient
try:
    from httpx import ASGITransport
except Exception:
    ASGITransport = None


class StubLogger:
    def __init__(self):
        self.calls = []

    def warning(self, *args, **kwargs):
        print("[stublogger] warning called", args, kwargs)
        self.calls.append((args, kwargs))


async def run_check():
    # Replace module logger with stub to capture warnings
    stub = StubLogger()
    nplusone_mod.logger = stub

    app = app_main.app

    # Add a temporary test route that simulates many queries by increasing the counter
    @app.get("/_test/nplusone")
    async def _test_nplusone_route():
        # simulate 10 queries within this request
        try:
            current = nplusone_mod._request_query_count.get()
        except Exception:
            current = 0
        nplusone_mod._request_query_count.set(current + 10)
        return {"simulated_queries": 10}


    if ASGITransport is not None:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
            resp = await ac.get("/_test/nplusone")
            print("response status:", resp.status_code, "body:", resp.json())
    else:
        async with AsyncClient(base_url="http://testserver") as ac:
            resp = await ac.get("/_test/nplusone")
            print("response status:", resp.status_code, "body:", resp.json())

    # Check captured calls
    found = False
    for args, kwargs in stub.calls:
        if args and args[0] == "nplusone_detected":
            print("N+1 detector fired:", kwargs)
            found = True

    if not found:
        print("N+1 detector did NOT fire. Collected calls:", stub.calls)
        return 2

    print("N+1 detector test succeeded.")
    return 0


if __name__ == "__main__":
    code = asyncio.run(run_check())
    sys.exit(code)
