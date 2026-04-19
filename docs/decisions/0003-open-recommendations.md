# ADR-0003: Open Recommendations — Inconsistencies, Missing Pieces, and Tooling

This document captures all inconsistencies found during an architecture audit on 2026-04-19, organized by priority. Each item includes the current state, the expected state per CLAUDE.md, and a recommended fix.

**Date:** 2026-04-19
**Status:** Open — items to be resolved incrementally

---

## 🔴 Critical (blocks core functionality)

### C1 — `route_events` table, task, and API endpoint do not exist

**Current state:** The Zillow-style activity timeline on the Route Detail page reads from `route_events`. The table, the Alembic migration, the `generate_events` Airflow task, and the `/api/events` backend endpoint are all absent.

**Expected state (CLAUDE.md, Phase 4):**
```
DAG flow: fetch_serpapi → cross_reference → score_deal → generate_events → branch_score
```

The `route_events` table schema is fully specified in CLAUDE.md (14 event types: `price_drop`, `price_rise`, `error_fare`, `award_opened`, `award_closed`, `airport_arbitrage`, `trend_reversal`, `new_low`, `stable`, `monitoring_started`, `fare_brand_detected`, `scarcity_alert`, `ai_insight`).

**Fix required:**
1. Create `backend/alembic/versions/007_route_events.py` with the table DDL from CLAUDE.md, including the index on `(route_id, timestamp DESC)`.
2. Create `backend/app/models/route_event.py` SQLAlchemy model.
3. Create `backend/app/services/event_generator.py` — writes events after each scan cycle (max 1 "stable" event per day for no-change scans).
4. Create `dags/tasks/generate_events.py` — Airflow task that calls `event_generator.py`, inserted between `score_deal` and `branch_score` in the DAG.
5. Add `dags/tasks/generate_events.py` import and task wiring in `scan_route_dag_factory.py`.
6. Create `backend/app/api/events.py` — `GET /api/routes/{route_id}/events` endpoint.
7. Register the new router in `backend/app/main.py`.

### C2 — `DealAnalysis.best_source` comment has stale source names

**Location:** `backend/app/models/deal.py`, line referencing `best_source`.

**Current state:**
```python
best_source: Mapped[str] = mapped_column(String(20), nullable=False)  # amadeus|google|kiwi
```

**Fix:**
```python
best_source: Mapped[str] = mapped_column(String(20), nullable=False)  # 'google' | 'duffel' | 'award'
```

---

## 🟠 High (incorrect behavior or spec violation)

### H1 — Six orphan frontend pages not in App.jsx router

**Current state:** Six page files exist in `frontend/src/pages/` but are not routed in `App.jsx`:
- `Dashboard.jsx` — redundant global deal feed (Home IS the feed per spec)
- `RouteManager.jsx` — standalone route CRUD (spec: CRUD via Home + RouteDetail)
- `PriceHistory.jsx` — standalone price chart (already embedded in RouteDetail)
- `AirportCompare.jsx` — standalone airport comparison **(spec: "NEVER a separate page")**
- `AlertSettings.jsx` — standalone alert rules **(spec: "merged into Settings")**
- `ScanHistory.jsx` — scan audit log (not in spec, but useful)

**Fix options (choose one):**
- **Option A (spec-compliant):** Delete `Dashboard.jsx`, `RouteManager.jsx`, `PriceHistory.jsx`, `AirportCompare.jsx`. Move `AlertSettings.jsx` content into `Settings.jsx`. Decide whether `ScanHistory.jsx` is worth keeping as a `/scan-history` developer-only route.
- **Option B (pragmatic):** Add all 6 to `App.jsx` with routes and add nav links. Acknowledge divergence from spec in this ADR.

Recommended: Option A. The spec is explicit about airport comparison and alert settings not being separate pages.

### H2 — `alembic.ini` has a hardcoded database URL

**Location:** `backend/alembic.ini`, line 4.

**Current state:**
```ini
sqlalchemy.url = postgresql+asyncpg://postgres:postgres@localhost/flightdeal
```

**Risk:** If this file is committed and pushed, it leaks database credentials. On the server, `postgres:postgres` may not be the actual password.

**Fix:**
```ini
# backend/alembic/env.py — override url from environment
from app.config import get_settings
settings = get_settings()
config.set_main_option("sqlalchemy.url", settings.database_url)
```

Add the override in `env.py` and remove the hardcoded URL from `alembic.ini`.

### H3 — `score_threshold` column type is `Integer` but score is now `Float`

**Context:** After the 0–10 normalization change (2026-04-19), `score_total` in `deal_analysis` is a `FLOAT` (e.g. `5.3`). The `alert_rules.score_threshold` column is still `INTEGER`.

**Fix:** Change the column to `Float` in both the model and migration:

```python
# backend/app/models/alert_rule.py
score_threshold: Mapped[float] = mapped_column(Float, default=5.0, nullable=False)
```

Create migration `008_alert_rule_score_float.py` to `ALTER COLUMN score_threshold TYPE FLOAT`.

---

## 🟡 Medium (missing features or improvement opportunities)

### M1 — Spanish (ES) language missing from AI advisor

**Current state:** `claude_advisor.py` generates AI recommendations in English and Portuguese only. `useSettings.js` and `LanguageSwitcher.jsx` support three languages: EN, ES, PT.

**Fix:** Add `ai_recommendation_es` column to `deal_analysis` (migration 009) and extend `claude_advisor.py` to generate Spanish text when `user.language == "es"`.

### M2 — No i18n library — string translation is manual

**Current state:** Language switching is managed via Zustand's `language` state. Components check `language === 'pt'` conditionally. This does not scale and has no extraction/lint tooling.

**Recommendation:** Replace with `react-i18next`. Steps:
1. `npm install react-i18next i18next`
2. Create `frontend/src/i18n/` with `en.json`, `es.json`, `pt.json` translation files.
3. Replace `language === 'pt' ? 'PT string' : 'EN string'` patterns with `t('key')` calls.
4. Bind `i18next.changeLanguage()` to `useSettings.setLanguage`.

This unlocks proper missing-translation warnings and makes adding new languages trivial.

### M3 — JWT stored in `localStorage` via Zustand persist

**Current state:** `useAuth.js` uses Zustand's `persist` middleware (key: `"flightdeal-auth"`), which stores the JWT access and refresh tokens in `localStorage`.

**Risk:** `localStorage` is accessible to any JavaScript running on the page. An XSS vulnerability could exfiltrate tokens.

**Recommendation:** Move to `httpOnly` cookies for token storage:
1. Backend: set `Set-Cookie: access_token=...; HttpOnly; Secure; SameSite=Strict` on login response.
2. Frontend: remove `persist` from `useAuth.js`; browser sends cookie automatically.
3. Update FastAPI auth middleware to read from cookie instead of `Authorization` header.

This is a meaningful security improvement, especially before the app handles real user data.

### M4 — No test coverage anywhere

**Current state:** Zero test files in `backend/` or `frontend/`.

**Recommendation:** Start minimal, not comprehensive:

**Backend:** `backend/tests/test_scoring.py`
```python
# pytest + pytest-asyncio
from app.services.scoring import score_deal, _action

def test_action_thresholds():
    assert _action(6.0, False) == "STRONG_BUY"
    assert _action(5.9, False) == "BUY"
    assert _action(4.9, False) == "WATCH"
    assert _action(2.4, False) == "SKIP"
    assert _action(0.0, True)  == "STRONG_BUY"  # GEM override

def test_score_normalizes_to_ten():
    result = score_deal(
        xref={"best_price_usd": 100, "is_gem": False, "sources_confirmed": ["google"]},
        google_result=None, daily_stats=None, duffel_result=None, award_results=None,
    )
    assert 0.0 <= result["score_total"] <= 10.0
```

**Frontend:** `frontend/src/components/ScoreBadge.test.jsx` with Vitest + React Testing Library.

### M5 — Two map libraries in use

**Current state:** `AirportMap.jsx` appears to use a different map library than `AirportComparisonMap.jsx` (which correctly uses MapLibre GL JS per spec).

**Recommendation:** Audit `AirportMap.jsx` and consolidate on MapLibre GL JS throughout. If `AirportMap.jsx` is only used in one place, replace it with `AirportComparisonMap.jsx`.

---

## 🟢 Low (minor polish and missing stubs)

### L1 — Missing frontend components from spec

The following components are listed in CLAUDE.md but not present in `frontend/src/components/`:

| Component | Purpose |
|-----------|---------|
| `AirlineRow.jsx` | Individual row in `AirlineLeaderboard` (currently inline) |
| `TripTypeComparison.jsx` | Round-trip vs two one-ways savings panel |
| `CheapestDateStrip.jsx` | Calendar color-coded strip below price chart |
| `AIInsightPanel.jsx` | Standalone AI recommendation panel (currently embedded in DealDetail) |

### L2 — `useSettings.js` is minimal

**Current state:** Only stores `language`. Missing: theme preference, currency, date format, alert defaults.

**Recommendation:** Expand to:
```js
const useSettings = create(persist((set) => ({
  language: 'en',
  theme: 'dark',
  currency: 'USD',
  dateFormat: 'MMM d, yyyy',
  defaultMinScore: 5.0,
  errorFareAlerts: true,
  awardAlerts: true,
  setLanguage: (l) => set({ language: l }),
  setTheme: (t) => set({ theme: t }),
  // ...
}), { name: 'fld-settings' }))
```

### L3 — `frontend/.env.local` template not created

**Current state:** No `.env.local` file or template exists for local frontend development.

**Recommendation:** Create `frontend/.env.local.example`:
```
VITE_API_URL=http://localhost:8000
VITE_BACKEND_HOST=localhost
VITE_WS_URL=ws://localhost:8000
VITE_VAPID_PUBLIC_KEY=
```

---

## Recommended New Tooling

These tools are not currently in the stack but would address specific gaps:

### Sentry (error tracking)

**Problem:** There is currently no visibility into runtime errors in production.

**Recommendation:** Add `sentry-sdk[fastapi]` to `backend/requirements.txt` and `@sentry/react` to frontend. One line each:

```python
# backend/app/main.py
import sentry_sdk
sentry_sdk.init(dsn=settings.sentry_dsn, traces_sample_rate=0.1)
```

```js
// frontend/src/main.jsx
import * as Sentry from "@sentry/react"
Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN })
```

Free tier supports 5,000 errors/month — more than sufficient for a personal project.

### slowapi (FastAPI rate limiting)

**Problem:** The `/api/scan` endpoint triggers all three data sources on demand. Without rate limiting, a malicious or accidental loop could exhaust the SerpApi monthly budget in minutes.

**Recommendation:**
```python
# backend/app/api/scan.py
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.post("/scan/{route_id}")
@limiter.limit("5/minute")
async def scan_now(route_id: str, request: Request): ...
```

### React Query (`@tanstack/query`)

**Problem:** All API calls in Zustand stores use manual loading/error state management with raw axios. This is verbose and inconsistent across stores.

**Recommendation:** Replace store-level fetch functions with `useQuery` / `useMutation` hooks. Benefits:
- Automatic background refetch on window focus.
- Stale-while-revalidate caching (eliminates redundant requests).
- Loading/error states for free.
- Query invalidation after mutations (e.g. after "Scan Now", automatically refetch route data).

```bash
npm install @tanstack/react-query
```

### `pre-commit` hooks

**Problem:** No automated code quality enforcement before commits.

**Recommendation:** Add `.pre-commit-config.yaml`:
```yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.4.0
    hooks:
      - id: ruff           # Python linting
      - id: ruff-format    # Python formatting
  - repo: https://github.com/pre-commit/mirrors-eslint
    rev: v9.0.0
    hooks:
      - id: eslint         # JS/JSX linting
```

```bash
pip install pre-commit
pre-commit install
```

---

## Related

- [Architecture overview](../architecture/overview.md) — current system state
- [Data model](../architecture/data-model.md#missing-route_events-table) — route_events spec
- [ADR-0001](0001-dynamic-scoring.md) — scoring engine design
