from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost/flightdeal"

    # ── Auth ──────────────────────────────────────────────────────────────────
    jwt_secret: str = "insecure-dev-secret-change-in-prod"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30

    # ── Redis ─────────────────────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"

    # ── API keys ──────────────────────────────────────────────────────────────
    serpapi_api_key: str = ""       # SerpApi — Google Flights (primary scanner)
    duffel_api_key: str = ""        # Duffel — on-demand fare brand enrichment
    seats_aero_api_key: str = ""    # Seats.aero — on-demand award availability
    anthropic_api_key: str = ""     # Claude AI advisor

    # ── Twilio ────────────────────────────────────────────────────────────────
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_whatsapp_from: str = "whatsapp:+14155238886"

    # ── Web Push (VAPID) ──────────────────────────────────────────────────────
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_claim_email: str = ""

    # ── App ───────────────────────────────────────────────────────────────────
    app_domain: str = "localhost"
    debug: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
