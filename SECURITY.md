# Security Policy

## Reporting Vulnerabilities

This is a personal project. If you find a security issue, contact Gabriel directly.

## Secret Management

### Required Secrets

All secrets live in `.env` (never committed). Copy `.env.example` to `.env` and fill in real values:

```bash
cp .env.example .env
# Edit .env with your real keys
```

| Variable | How to generate |
|----------|----------------|
| `DB_PASSWORD` | `openssl rand -base64 32` |
| `JWT_SECRET` | `openssl rand -hex 64` |
| `AIRFLOW_FERNET_KEY` | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `AIRFLOW_SECRET_KEY` | `openssl rand -hex 32` |
| `SERPAPI_API_KEY` | Sign up at [serpapi.com](https://serpapi.com) |
| `DUFFEL_API_KEY` | Sign up at [duffel.com](https://duffel.com) |
| `SEATS_AERO_API_KEY` | Sign up at [seats.aero](https://seats.aero) |
| `ANTHROPIC_API_KEY` | Sign up at [console.anthropic.com](https://console.anthropic.com) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Sign up at [twilio.com](https://twilio.com) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `python -c "from py_vapid import Vapid; v=Vapid(); v.generate_keys(); print(v.public_key); print(v.private_key)"` |

### Protection Layers

1. **`.gitignore`** — Blocks `.env`, `*.pem`, `*.key`, `credentials.json`, and 20+ secret file patterns from ever being staged.

2. **Pre-commit hooks (gitleaks)** — Scans every commit for leaked API keys, passwords, and tokens before they reach git history. Includes custom rules for SerpApi, Duffel, Seats.aero, and Twilio key patterns.

3. **Runtime validation (`config.py`)** — The app refuses to start in production (`APP_DOMAIN != localhost`) if `JWT_SECRET` or `DB_PASSWORD` still use insecure defaults.

4. **Docker isolation** — Secrets are injected via `${VAR}` substitution in `docker-compose.yml`, never baked into images.

### Setup

```bash
# Install pre-commit hooks (one-time)
pip install pre-commit
pre-commit install

# Verify the scanner works
pre-commit run gitleaks --all-files
```

## API Key Rotation

If a key is compromised:

1. **SerpApi** — Regenerate at [serpapi.com/manage-api-key](https://serpapi.com/manage-api-key)
2. **Duffel** — Regenerate in the [Duffel dashboard](https://app.duffel.com)
3. **Seats.aero** — Contact support or regenerate in account settings
4. **Anthropic** — Regenerate at [console.anthropic.com](https://console.anthropic.com)
5. **Twilio** — Rotate in the [Twilio console](https://console.twilio.com)

After regeneration:
```bash
# Update .env with new key
# Restart services
docker compose down && docker compose up -d
```

## Architecture Security Notes

- **JWT tokens** — Short-lived access tokens (30 min) + refresh tokens (30 days). HS256 algorithm.
- **Database** — PostgreSQL with password auth. No public port exposure in production (only internal Docker network).
- **API keys in transit** — SerpApi uses query params (HTTPS only). Duffel and Seats.aero use headers. All external calls go over TLS.
- **No user-supplied SQL** — All queries use SQLAlchemy ORM with parameterized queries.
- **CORS** — Configured in FastAPI middleware, locked to `APP_DOMAIN` in production.
- **Nginx** — SSL termination via Let's Encrypt. HTTP redirects to HTTPS.
