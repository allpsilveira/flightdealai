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
    amadeus_client_id: str = ""
    amadeus_client_secret: str = ""
    searchapi_api_key: str = ""
    kiwi_api_key: str = ""
    duffel_api_key: str = ""
    seats_aero_api_key: str = ""
    anthropic_api_key: str = ""

    # ── Twilio ────────────────────────────────────────────────────────────────
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_whatsapp_from: str = "whatsapp:+14155238886"

    # ── App ───────────────────────────────────────────────────────────────────
    app_domain: str = "localhost"
    debug: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
