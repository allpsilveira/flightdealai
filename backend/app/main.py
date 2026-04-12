import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.config import get_settings
from app.api import auth, routes, deals, prices, awards, airports, cabins, alerts, ws, scan, webhooks

logger = structlog.get_logger()
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("FlyLuxuryDeals backend starting up")

    # Start daily route scanner — wrapped so a missing apscheduler package
    # (e.g. container not yet rebuilt) never prevents the app from starting.
    scheduler = None
    try:
        from app.services.daily_scheduler import create_scheduler
        scheduler = create_scheduler(str(settings.database_url))
        scheduler.start()
        logger.info("daily_scheduler_started")
    except Exception as exc:
        logger.warning("daily_scheduler_unavailable", error=str(exc))

    yield

    if scheduler is not None:
        try:
            scheduler.shutdown(wait=False)
        except Exception:
            pass
    logger.info("FlyLuxuryDeals backend shutting down")


app = FastAPI(
    title="FlyLuxuryDeals",
    description="Luxury travel deal intelligence platform",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# ── Middleware ─────────────────────────────────────────────────────────────────
app.add_middleware(GZipMiddleware, minimum_size=1000)
_cors_origins = [
    "http://localhost:5173",
    "http://localhost:80",
    "https://flyluxurydeals.com",
    "https://www.flyluxurydeals.com",
]
if settings.app_domain and settings.app_domain not in ("flyluxurydeals.com", "www.flyluxurydeals.com"):
    _cors_origins.append(f"https://{settings.app_domain}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────────
app.include_router(auth.router,     prefix="/api/auth",     tags=["auth"])
app.include_router(routes.router,   prefix="/api/routes",   tags=["routes"])
app.include_router(deals.router,    prefix="/api/deals",    tags=["deals"])
app.include_router(prices.router,   prefix="/api/prices",   tags=["prices"])
app.include_router(awards.router,   prefix="/api/awards",   tags=["awards"])
app.include_router(airports.router, prefix="/api/airports", tags=["airports"])
app.include_router(cabins.router,   prefix="/api/cabins",   tags=["cabins"])
app.include_router(alerts.router,   prefix="/api/alerts",   tags=["alerts"])
app.include_router(ws.router,       prefix="/ws",           tags=["websocket"])
app.include_router(scan.router,     prefix="/api/scan",     tags=["scan"])
app.include_router(webhooks.router, prefix="/api/webhooks", tags=["webhooks"])


@app.get("/api/health", tags=["health"])
async def health():
    return {"status": "ok", "service": "flightdeal-ai"}
