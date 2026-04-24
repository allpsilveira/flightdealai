# FlyLuxuryDeals — Architecture Audit & Systems Blueprint

> Author: full automated audit, April 20, 2026.
> Purpose: honest single-document assessment of every layer of the system — what's solid, what's broken, what's missing, and what to do in what order.
>
> Read this before any new feature work. It replaces scattered mental models across CLAUDE.md, the migration history, and the docs/ folder. When CLAUDE.md and this document conflict, file a discrepancy and reconcile — don't assume either is right.

---

## 0. Executive summary

The project is **~80% complete** across backend, frontend, and infrastructure. The scoring engine, data pipeline, Airflow orchestration, and core frontend pages are all real and well-built. The codebase is professionally structured, async throughout, and follows the luxury concierge aesthetic consistently.

**What's holding it back from production:**

1. **i18n is paper-thin.** The STRINGS catalog covers ~5% of the UI. 26 of 31 components hardcode English. This breaks the trilingual requirement entirely.
2. **The spec says no standalone Alert Settings or Airport Comparison pages. Both exist and are orphaned.** They confuse the architecture and have duplicate implementations.
3. **No SSL.** Nginx config is HTTP-only. Production deployment on Hostinger without this is a non-starter.
4. **Duffel/Seats.aero are still score-gated** inside the DAG, contradicting the spec (should run daily + on-demand for all routes, not only high-score deals).
5. **Three scoring components are missing:** scarcity, airport arbitrage, fare brand. That's 25 raw points unscored.
6. **FareDetailPanel is a 900-line monolith** that needs decomposition before it becomes unmaintainable.

Everything else is either working correctly, gracefully degrading, or deferred (ML artifacts, Let's Encrypt automation). The issues above are the ones worth attacking first.

---

## 1. System overview

```
                          ┌─────────────────────────────────────────────────────────────┐
                          │                     DOCKER COMPOSE                          │
   ┌──────────────┐       │  ┌──────────┐   ┌──────────────┐   ┌────────────────────┐  │
   │  SerpApi     │──────▶│  │          │   │   TimescaleDB │   │  Airflow           │  │
   │  (GFlights)  │       │  │  FastAPI  │──▶│   Postgres   │◀──│  (LocalExecutor)   │  │
   │  $25/mo      │       │  │  backend  │   │   port 5432  │   │  port 8080         │  │
   └──────────────┘       │  │  port 8000│   └──────────────┘   │  DAGs: 10          │  │
   ┌──────────────┐       │  │           │                       │  Tasks: ~40        │  │
   │  Duffel      │──────▶│  │  50+ API  │   ┌──────────────┐   └────────────────────┘  │
   │  (Direct GDS)│       │  │  routes   │──▶│    Redis     │                           │
   │  ~$2/mo      │       │  │           │   │  (Airflow    │   ┌────────────────────┐  │
   └──────────────┘       │  │  22 svc   │   │   broker)    │   │  Frontend (Vite)   │  │
   ┌──────────────┐       │  │  modules  │   └──────────────┘   │  port 5173 (dev)   │  │
   │  Seats.aero  │──────▶│  │           │                       │  React 18+Tailwind │  │
   │  (Award avl) │       │  │  8 ML     │◀─ ─ ─ ─ ─ ─ ─ ─ ─   │  Zustand state    │  │
   │  $10/mo      │       │  │  models   │   (weekly retrain)    │  Recharts/MapLibre │  │
   └──────────────┘       │  └──────────┘                       └────────────────────┘  │
                          │       ▲                                       ▲              │
                          │       │         ┌──────────────┐              │              │
                          │       └─────────│    Nginx     │──────────────┘              │
                          │                 │  port 80/443 │                             │
                          │                 │  (SSL: 🔴)  │                             │
                          └─────────────────┴──────────────┴─────────────────────────── ┘
                                                    │
                                          ┌─────────┴─────────┐
                                          │  External alerts   │
                                          │  Twilio WhatsApp   │
                                          │  Web Push (VAPID)  │
                                          └───────────────────┘
```

### Data flow (one scan cycle)

```
[Airflow scheduler: every 2/4/8h depending on route tier]
    │
    ▼
fetch_serpapi
    │  Writes: google_prices (1 row), flight_offers (N rows per airline+stops)
    │  XCom: google_result (id + price + score_inputs)
    ▼
cross_reference
    │  Reads: last 3 sources' prices, computes gem/match_type
    │  XCom: xref_summary
    ▼
score_deal
    │  Reads: price_daily_stats (percentiles), xref_summary
    │  Writes: deal_analysis row
    │  XCom: score_total, deal_id, action
    ▼
generate_events               ← ⚠️ NOT CONNECTED in current DAG
    │  Reads: previous deal, score delta, event triggers
    │  Writes: route_events
    ▼
branch_score (≥ 3.0 → ai_analysis | < 3.0 → log_skip)
    ▼ (if ≥ 3.0)
ai_analysis
    │  Calls: Claude Sonnet API (EN + PT)
    │  Writes: deal_analysis.ai_recommendation_{en,pt}
    ▼
branch_action (BUY/GEM → enrich | WATCH/NORMAL → update_dashboard)
    ▼ (if BUY/GEM)                              ← ⚠️ Should be score-UNGATED (daily + on-demand)
enrich_duffel          enrich_awards
    │  Writes: duffel_prices    Writes: award_prices
    │  (fare brand, conditions) (miles, CPP, partners)
    ▼
dispatch_alerts
    │  Twilio WhatsApp + Web Push
    ▼
update_priority  ← (all paths converge via NONE_FAILED_MIN_ONE_SUCCESS)
```

---

## 2. Database — complete schema map

### 2.1 Regular tables

| Table | Key columns | Notes |
|---|---|---|
| `users` | id (UUID), email, hashed_password, role, language, web_push_subscription | JWT auth anchor |
| `routes` | id (UUID), user_id (FK), origins[], destinations[], cabin_classes[], trip_type, date_range, priority, is_active | Array fields for multi-origin/dest; `priority` drives scan tier |
| `alert_rules` | id, user_id (FK), route_id (FK), score_threshold, alert_types[], channels[], is_active | Per-route override rules |
| `cabin_quality` | id, airline, aircraft, product_name, quality_score (0-100), seat_type, has_door, lie_flat, bed_length, seat_width, config | Static enrichment; seeded from cabin_quality.json |
| `transfer_partners` | id, card_program, airline_program, ratio, transfer_url | Static; seeded from transfer_partners.json |
| `program_baselines` | id, program, baseline_cpp, min_cpp_good | Per-program CPP baselines for award scoring |
| `route_events` | id, route_id (FK), event_type (14 types), severity, headline, detail, subtext, airline, price_usd, deal_analysis_id | Time-series intelligence; powers Zillow-style timeline |
| `scan_history` | id, route_id (FK), trigger_type, status, duration_seconds, best_price, deals_scored | Operational audit log |
| `saved_items` | id, user_id (FK), item_type, item_id, snapshot (JSONB), saved_at | User bookmarks |

### 2.2 Hypertables (TimescaleDB time-series)

| Hypertable | Partition key | What it stores | Retention |
|---|---|---|---|
| `google_prices` | scanned_at | Best SerpApi price per route×cabin×origin scan | 2 years |
| `flight_offers` | scanned_at | Every airline×stops offer from SerpApi per scan | 1 year |
| `duffel_prices` | fetched_at | Duffel direct airline cash price + fare brand | 2 years |
| `award_prices` | fetched_at | Seats.aero miles availability per loyalty program | 2 years |
| `deal_analysis` | analyzed_at | Scored deals with score breakdown + AI recommendations | Permanent |
| `route_intelligence` | computed_at | Price regime, forecast, cycle, DOW pattern, KNN | Rolling 90d |
| `price_predictions` | predicted_at | ML forecaster output per route×cabin×horizon | Rolling 30d |
| `api_usage_log` | called_at | Per-call API cost tracking (token/cost counts) | 90 days |

### 2.3 Continuous aggregates

| View | Source | Purpose | Status |
|---|---|---|---|
| `google_price_hourly` | google_prices | Hourly OHLC per route×cabin | ✅ Created in migrations |
| `price_daily_stats` | google_prices | Daily p5/p10/p20/p25/p30/median/p75/p90 + stddev + min | ⚠️ **Missing — queried by scoring but never created** |

> **Action required:** Add `price_daily_stats` continuous aggregate to migration 009 or a new 010. The scoring engine calls it; without it, `percentile_rank` always returns `None` and z-score falls back to 0 for all deals, severely degrading score quality.

### 2.4 Dead tables (kept for history, never written to)

`amadeus_prices`, `kiwi_prices` — correct per spec, no code references them.

---

## 3. Backend services — what they do and what's missing

### 3.1 Data clients

| Service | Status | Notes |
|---|---|---|
| `serpapi_client.py` | ✅ Solid | Async, parses price_insights + all offers; extracts per-airline IATA from logo URL |
| `duffel_client.py` | ✅ Solid | fare brand, conditions, expiry, baggage; rate-limit handling |
| `seats_aero_client.py` | ✅ Solid | Cached search + bulk availability; CPP extraction; one uncaught async gap (ping) |

### 3.2 Intelligence pipeline

| Service | Status | Notes |
|---|---|---|
| `stats.py` | ⚠️ Partial | Queries `price_daily_stats`; returns None gracefully if missing — but this means cold start scores are always zero |
| `cross_reference.py` | ✅ Works | Single-source gem detection (Google only); gem threshold defined, multi-source path ready |
| `scoring.py` | ⚠️ Partial | 7 of 10 score components implemented. **Missing: scarcity (0-5), airport arbitrage (0-10), fare brand value (0-10).** Max achievable score is currently 87/120 |
| `award_analyzer.py` | ✅ Solid | CPP calculation, transfer partner lookup, program accessibility scoring |
| `event_generator.py` | ⚠️ Partially wired | Logic exists but `generate_events` task is not called in the main DAG between `score_deal` and `ai_analysis` |
| `score_explainer.py` | ✅ Works | Driver breakdown with weights, confidence bands; Powers `/deals/{id}/explain` |
| `claude_advisor.py` | ✅ Works | EN + PT output; Sonnet for routine, Opus for complex; cost tracked in api_usage_log |
| `ingestion.py` | ✅ Works | Upsert logic with `ON CONFLICT DO NOTHING`; idempotent |
| `deal_pipeline.py` | ⚠️ Partial | `force_enrich` flag defined but not passed through. Always-enrich logic present but `force_enrich=False` path not plumbed from DAG |
| `intelligence.py` | ✅ Solid | Price regime, cycle detection, DOW pattern, KNN, Pearson lead time |

### 3.3 ML layer (`services/ml/`)

| Module | Status | Notes |
|---|---|---|
| `forecaster.py` | ✅ Built | AutoARIMA per route×cabin; graceful None if no artifact |
| `anomaly.py` | ✅ Built | IsolationForest for error-fare confirmation; None if no artifact |
| `expected_price.py` | ✅ Built | LightGBM + SHAP top-3; None if no artifact |
| `scorer.py` | ✅ Built | Combines hand-scored + ML signals; hand-scored always authoritative |
| `ml_models/` directory | ❌ Missing | No `ml_models/` folder at repo root. Retraining DAG has nowhere to write artifacts |

### 3.4 Alerts

| Service | Status | Notes |
|---|---|---|
| `whatsapp.py` | ✅ Solid | Twilio template messages; formatting for PT/EN; retry on failure |
| `web_push.py` | ✅ Solid | VAPID signing; graceful if no subscription |

### 3.5 API route ownership gap

`GET /api/awards/best/{route_id}` — does not verify that the authenticated user owns the route. Any authenticated user can read any route's award data. Should add `check_route_ownership(route_id, current_user, db)` guard matching the pattern in `routes.py`.

---

## 4. API endpoints — complete inventory

### Auth (4 routes — public)
`POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`, `PATCH /auth/me`

### Routes (6 routes — authenticated)
`GET /routes/`, `POST /routes/`, `GET /routes/{id}`, `PATCH /routes/{id}`, `DELETE /routes/{id}`, `GET /routes/{id}/scan-config`

### Deals (5 routes — authenticated)
`GET /deals/`, `GET /deals/{id}`, `GET /deals/{id}/explain`, `POST /deals/{id}/save`, `GET /deals/summary`

### Prices (5 routes — authenticated)
`GET /prices/history/{route_id}`, `GET /prices/cheapest-dates/{route_id}`, `GET /prices/compare/{route_id}`, `GET /prices/stats/{route_id}`, `GET /prices/flight-offers/{deal_id}`

### Awards (3 routes — authenticated; 1 with ownership gap)
`GET /awards/{route_id}`, `GET /awards/best/{route_id}` ⚠️, `GET /awards/programs`

### Events (4 routes — authenticated)
`GET /events/route/{route_id}`, `GET /events/{event_id}`, `GET /events/{event_id}/snapshot`, `GET /events/summary/{route_id}`

### Scan (2 routes — authenticated)
`POST /scan/route/{route_id}`, `GET /scan/history`

### Intelligence (2 routes — authenticated)
`GET /intelligence/{route_id}/forecast`, `GET /intelligence/{route_id}/summary`

### Alerts (4 routes — authenticated)
`GET /alerts/`, `POST /alerts/`, `DELETE /alerts/{id}`, `POST /alerts/test`

### Cabins (2 routes — authenticated)
`GET /cabins/`, `GET /cabins/{airline}`

### Airports (2 routes — public)
`GET /airports/search`, `GET /airports/{iata}`

### Saved (3 routes — authenticated)
`GET /saved/`, `DELETE /saved/{id}`, `POST /share/generate`

### Webhooks (1 route — service-to-service, token-gated)
`POST /webhooks/airflow-notify`

### WebSocket (1 — JWT-gated)
`GET /ws/deals?token=<jwt>`

---

## 5. Airflow DAG inventory

| DAG | Schedule | What it does | Issues |
|---|---|---|---|
| `scan_{route_id}_{cabin}` | HOT 2h / WARM 4h / COLD 8h | Full scan pipeline per route×cabin | `generate_events` not wired; Duffel/Awards score-gated (should be daily/on-demand) |
| `weekly_briefing` | Mon 7 AM | Claude market summary → WhatsApp all active users | ✅ |
| `stats_refresh` | Every 6h | Refresh TimescaleDB continuous aggregates | ✅ |
| `cheapest_date_scan` | Daily 6 AM | SerpApi 60-day cheapest date sweep | ✅ |
| `intelligence_refresh` | Every 6h | Regime, cycle, forecast, KNN, DOW per route | ✅ |
| `ml_retrain` | Sundays 3 AM | Forecaster + anomaly + expected_price retraining | `ml_models/` directory missing |
| `correlation_alert` | Every 2h | Cascade price_drop to Pearson-correlated routes | ✅ |
| `outcome_tracker` | Daily 4 AM | Label 14-60 day old deals with forward outcomes | ✅ |
| `weight_learning` | Sundays 2 AM | Random Forest: subscore weights → deal outcomes | ✅ |
| `cabin_quality_refresh` | 1st of month 9 AM | Claude reviews cabin product entries | **Stub only — logs count, no updates** |

### Missing DAG task: `generate_events`

The `route_events` table and `event_generator.py` service exist and are tested. The `generate_events` task file exists at `dags/tasks/`. But it is not inserted into the DAG factory between `score_deal` and `ai_analysis`. Without this wiring, the Zillow-style timeline on the frontend only shows whatever events were seeded manually — it never populates from live scans.

### Score-gating violation

Per CLAUDE.md:
> "Duffel and Seats.aero run once daily at 7 AM + on 'Scan Now'. NOT score-gated."

Current DAG branches on `action IN (STRONG_BUY, BUY, GEM)` before calling `enrich_duffel` and `enrich_awards`. This means WATCH and NORMAL score deals never get Duffel/Seats.aero enrichment, even on the daily 7 AM run. The branch logic must be converted to a schedule-check: always enrich if `trigger_type == 'daily_7am'` or `trigger_type == 'scan_now'`, regardless of score.

---

## 6. Frontend — structural map

### 6.1 Navigation tree

```
App.jsx
├── / (Home) ─────── RouteCard list, scan controls, AddRouteModal
├── /routes/:id ──── RouteDetail (two-column layout)
│   ├── Left: EnhancedPriceChart, CheapestDateStrip, EventTimeline/ActivityTimeline
│   └── Right: AirlineLeaderboard, IntelligencePanel, AIInsightPanel, TripTypeComparison
│       └── [click row] → FareDetailPanel (slide-in)
│           ├── Fare details + CabinQualityBadge + ExpiryCountdown + SourceBadges
│           ├── AirportComparisonMap (embedded ✅)
│           └── AwardComparison (embedded ✅)
├── /settings ────── Account, Notifications, Display, API Usage, Developer Tools
├── /saved ────────── Saved deals/events/routes with snapshots
├── /share/:token ── ShareView (public, unauthenticated)
│
│ ── ORPHANED (no nav links, no spec backing) ──
├── /price-history ─── PriceHistory.jsx (superseded by EnhancedPriceChart in RouteDetail)
├── /scan-history ──── ScanHistory.jsx (dev tool, not user-facing)
├── /airport-compare ─ AirportCompare.jsx (duplicate of FareDetailPanel's embedded section)
└── /alert-settings ── AlertSettings.jsx (should be route-scoped in RouteDetail, not a page)
```

### 6.2 Store wiring status

| Store | Used in pages | Used in components | Status |
|---|---|---|---|
| `useAuthStore` | Login, Settings | GlobalHeader | ✅ Active |
| `useRoutesStore` | Home, RouteDetail | RouteCard | ✅ Active |
| `useSettingsStore` | Settings | GlobalHeader, LanguageSwitcher | ✅ Active |
| `useDealsStore` | ❌ None | ❌ None | **Orphaned** |
| `useEventsStore` | ❌ None | ❌ None (timeline fetches directly) | **Orphaned** |
| `useAlertsStore` | AlertSettings (orphaned) | ❌ None | **Orphaned** |

### 6.3 i18n coverage audit

`i18n.js` exports a `t(key, lang?)` function backed by a STRINGS object.

**Critical i18n violations (hardcoded English):**

| Component | Hardcoded strings (examples) |
|---|---|
| `RouteCard` | "Scan Now", "Scanning", "No prices yet" |
| `AddRouteModal` | All step labels, all option labels, all form text |
| `DealCard` | "GEM DEAL", "saves", score action labels |
| `FareDetailPanel` | "Fare Details", "Airport Comparison", "Award Comparison", "Book now", "Save", "Share" |
| `EnhancedPriceChart` | "Avg", "Min", "All-time low", "14-day forecast", range labels |
| `ActivityTimeline` | "Manual", "Scheduled", "Failed", filter pills |
| `EventTimeline` | "All", "Critical", "Notable" |
| `CheapestDateStrip` | "Cheapest dates · next 60 days", level labels |
| `AirlineLeaderboard` | "Airline", "No airline breakdown yet" |
| `TripTypeComparison` | "Trip Comparison", "Two One-Ways", "Round Trip", "Save $X" |
| `IntelligencePanel` | "Recommendation", "14-day forecast", "Confidence" |
| `ScoreExplainer` | "Why this score", "Technical view", confidence labels |
| `AirportComparisonMap` | "same area", "drive", role labels |
| `EventDetailDrawer` | All label text |
| `ErrorBoundary` | "Something broke here" |
| `GlobalHeader` | "Sign out" |

STRINGS catalog current coverage: **~80 keys** (roughly: auth flows + settings + score actions). Missing: **all component labels** across the above table.

---

## 7. Infrastructure — status by layer

### 7.1 Docker Compose

| Service | Health check | Restart policy | Issues |
|---|---|---|---|
| postgres | ✅ `pg_isready` | always | Init script lacks `IF NOT EXISTS` — fails on restart |
| redis | ✅ `redis-cli ping` | always | ✅ |
| airflow-init | one-shot | on-failure | ✅ |
| airflow-webserver | ✅ HTTP `/health` | always | ✅ |
| airflow-scheduler | ✅ HTTP `/health` | always | ✅ |
| backend | ✅ HTTP `/api/health` | always | ✅ |
| frontend | ❌ None | always | **Dev mode (Vite) — must switch to prod target for Hostinger** |
| nginx | ❌ None | always | **HTTP-only, no SSL, no healthcheck** |

### 7.2 Nginx

Current state: HTTP only on port 80. Port 443 block exists in the file as a comment. No certificate, no redirect.

Required for production:
```nginx
# In nginx/conf.d/default.conf — needs these blocks:
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    ssl_certificate     /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    # ... (existing proxy rules move here)
}
```

Also missing: `proxy_read_timeout` is 60s, too short for the `POST /scan/route/{id}` endpoint which calls SerpApi + Duffel + Seats.aero synchronously. Should be 180s minimum.

### 7.3 Service worker

- ✅ Push notification display works
- ⚠️ "View Deal" action routes to `/` instead of `/routes/{route_id}` — the payload includes route_id but the click handler ignores it
- ⚠️ All notifications share the tag `"flightdeal-alert"` — each new notification replaces the previous one. Use `"flightdeal-{route_id}"` for per-route stacking

---

## 8. Scoring engine — gap analysis

### Current component status

| Component | Max points | Status |
|---|---|---|
| Percentile position | 30 | ✅ Implemented |
| Z-score signal | 20 | ✅ Implemented |
| Google trend alignment | 15 | ✅ Implemented |
| Trend direction (7-day slope) | 10 | ✅ Implemented |
| Cross-source validation | 20 | ✅ Implemented (single-source mode) |
| Airport arbitrage | 10 | ❌ **Missing** |
| Fare brand value | 10 | ❌ **Missing** (data stored in duffel_prices, not read by scorer) |
| Scarcity | 5 | ❌ **Missing** |
| Award CPP | 20 (bonus) | ✅ Implemented |
| Award scarcity | 15 (bonus) | ✅ Implemented |
| Program accessibility | 15 (bonus) | ✅ Implemented |

**Current max achievable score: 95/170 raw → 5.6/10 normalized.**
**Correct max should be: 170/170 raw → 10.0/10 normalized.**

A STRONG_BUY deal today caps at 5.6 even if every condition is perfect. This means the 6.0 STRONG_BUY threshold is currently unreachable.

### Missing `price_daily_stats` continuous aggregate

This is the most consequential single missing piece. Without it:
- Percentile position always returns 0 (30 points lost)
- Z-score always returns 0 (20 points lost)
- Trend alignment partially works (uses SerpApi's `typical_price_range` field) but the own-data path is dead

**50 of 120 cash score points are unscored on every deal until this is created.**

---

## 9. Complete priority-ordered action list

### Tier 1 — Fix before first production use

| # | What | Where | Why |
|---|---|---|---|
| 1 | Create `price_daily_stats` continuous aggregate | New migration `010_price_daily_stats.py` | 50/120 score points are dead without it |
| 2 | Wire `generate_events` task into DAG factory | `dags/scan_route_dag_factory.py` | Timeline is empty in production |
| 3 | Remove score-gating from Duffel/Awards enrichment | `dags/scan_route_dag_factory.py` + `dags/tasks/fetch_duffel.py` + `dags/tasks/fetch_awards.py` | Spec says daily/on-demand for all routes |
| 4 | Add SSL to nginx | `nginx/conf.d/default.conf` | HTTP-only is a non-starter; Hostinger EasyPanel supports Let's Encrypt |
| 5 | Fix postgres init script idempotency | `infra/postgres/init-multiple-dbs.sh` | Fails on every `docker compose restart` |
| 6 | Fix route ownership check in awards API | `backend/app/api/awards.py` L65 | IDOR — any user can read any route's awards |
| 7 | Create `ml_models/` directory with `.gitkeep` | Repo root | ml_retrain DAG crashes on write with no target dir |

### Tier 2 — Fix before public / shared use

| # | What | Where | Why |
|---|---|---|---|
| 8 | Implement missing scoring: scarcity, airport arbitrage, fare brand | `backend/app/services/scoring.py` | 25 points unscored; STRONG_BUY unreachable |
| 9 | Complete i18n STRINGS catalog | `frontend/src/lib/i18n.js` | ~90% of UI is hardcoded English |
| 10 | Wrap all hardcoded strings in `t()` calls | 26 components (FareDetailPanel, AddRouteModal, etc.) | Spec requirement: trilingual EN/ES/PT |
| 11 | Delete or reclassify orphaned pages | `frontend/src/pages/` — delete AirportCompare.jsx, PriceHistory.jsx; move ScanHistory + AlertSettings to developer-only routes | Spec says these should not exist as standalone pages |
| 12 | Move alert rule management to RouteDetail | `frontend/src/pages/RouteDetail.jsx` + `frontend/src/stores/useAlerts.js` | CLAUDE.md: "route overrides on Route Detail, not Settings" |
| 13 | Wire unused Zustand stores or delete them | `useDealsStore.js`, `useEventsStore.js`, `useAlertsStore.js` | Dead stores add confusion and have no effect |
| 14 | Persist language setting to backend | `frontend/src/stores/useSettings.js` → `PATCH /auth/me` | Language must survive page reload + influence AI output language |
| 15 | Change frontend compose target from `dev` to `prod` | `docker-compose.yml` | Vite dev server must not run on Hostinger |
| 16 | Add health checks to frontend and nginx services | `docker-compose.yml` | Compose considers these healthy even when crashed |
| 17 | Fix nginx `proxy_read_timeout` | `nginx/conf.d/default.conf` | 60s causes timeout on Scan Now (SerpApi+Duffel+Seats.aero in sequence) |

### Tier 3 — Polish and completeness

| # | What | Where | Why |
|---|---|---|---|
| 18 | Fix service worker: route "View Deal" to `/routes/{route_id}` | `frontend/public/sw.js` | Notification click opens home instead of relevant route |
| 19 | Per-route notification tag deduplication | `frontend/public/sw.js` | All notifications overwrite each other |
| 20 | Implement cabin_quality_refresh DAG logic | `dags/cabin_quality_refresh_dag.py` | Currently a stub (just counts rows) |
| 21 | Fix `seats_aero_client.py` unawaited ping coroutine | `backend/app/services/seats_aero_client.py` L33 | Coroutine not resolved (no-op but may cause warnings) |
| 22 | Decompose FareDetailPanel | `frontend/src/components/FareDetailPanel.jsx` | 900 lines; split into FareHeader, PricePositionBar, AirportSection, AwardSection, ActionsBar |
| 23 | Add Airflow production config | `docker-compose.yml` | Set `AIRFLOW__SCHEDULER__MAX_ACTIVE_RUNS_PER_DAG`, `AIRFLOW__CORE__PARALLELISM` |
| 24 | Frontend nginx hardcoded service name | `frontend/nginx.conf` | Hardcodes `flightdeal-ai_backend` — will break if compose project name changes |
| 25 | Add `VITE_VAPID_PUBLIC_KEY` to frontend environment | `docker-compose.yml` | Web Push can't subscribe without the public key |

---

## 10. Feature completeness matrix (vs CLAUDE.md spec)

| Feature | Spec | Actual | Ready? |
|---|---|---|---|
| SerpApi scan with price_insights + all offers | Phase 2 | ✅ | ✅ |
| Duffel fare brand + conditions + expiry | Phase 2 | ✅ | ✅ |
| Seats.aero award availability + CPP | Phase 2 | ✅ | ✅ |
| Dynamic scoring (no hardcoded thresholds) | Phase 3 | ✅ 7/10 components | ⚠️ |
| Cold-start bootstrap (SerpApi typical_range) | Phase 3 | ✅ | ✅ |
| Route events (14 types, Zillow timeline) | Phase 3 | ✅ (unwired from DAG) | ⚠️ |
| Award CPP + transfer partner mapping | Phase 3 | ✅ | ✅ |
| Airport comparison logic | Phase 3 | ✅ | ✅ |
| Fare brand detection + scoring | Phase 3 | Data: ✅ Scoring: ❌ | ⚠️ |
| Claude AI advisor (EN/PT) | Phase 3 | ✅ | ✅ |
| Airflow DAG factory + branching | Phase 4 | ✅ (score-gating bug) | ⚠️ |
| ML: forecaster + anomaly + expected_price | Phase 4 | ✅ (no artifact dir) | ⚠️ |
| Adaptive weight learning | Phase 4+ | ✅ | ✅ |
| Correlation cascade alerts | Phase 4+ | ✅ | ✅ |
| Home page (route grid, urgency sort) | Phase 5 | ✅ | ✅ |
| Route creation modal (5-step) | Phase 5 | ✅ (no i18n) | ⚠️ |
| Price chart (SteamDB-style) | Phase 5 | ✅ | ✅ |
| Cheapest-date calendar strip | Phase 5 | ✅ | ✅ |
| Activity/event timeline | Phase 5 | ✅ (unwired) | ⚠️ |
| Airline leaderboard | Phase 5 | ✅ | ✅ |
| Ticket detail panel (slide-in) | Phase 5 | ✅ (900 lines) | ⚠️ |
| Airport comparison embedded in ticket panel | Phase 5 | ✅ | ✅ |
| Award comparison in ticket panel | Phase 5 | ✅ | ✅ |
| Settings page (account+notifs+display+dev) | Phase 5 | ✅ | ✅ |
| Global header + language switcher (EN/ES/PT) | Phase 5 | ✅ (client only) | ⚠️ |
| Trilingual i18n throughout | Phase 5 | ~5% coverage | ❌ |
| Saved items | Phase 5 | ✅ | ✅ |
| Share links (public read-only) | Phase 5 | ✅ | ✅ |
| Score explainer UI | Phase 5 | ✅ | ✅ |
| Intelligence panel (regime + forecast) | Phase 5 | ✅ | ✅ |
| Twilio WhatsApp alerts | Phase 6 | ✅ | ✅ |
| Web Push (VAPID) | Phase 6 | ✅ (key not in env) | ⚠️ |
| Weekly briefing DAG | Phase 6 | ✅ | ✅ |
| Nginx SSL + Let's Encrypt | Phase 6 | ❌ | ❌ |
| Docker production optimization | Phase 6 | Partial | ⚠️ |
| Hostinger KVM 2 deploy | Phase 7 | Not started | ❌ |

---

## 11. Recommended build order for the next 2 weeks

### Week 1: Make the scoring intelligence real

1. **Migration 010:** `price_daily_stats` continuous aggregate + `ml_models/` dir
2. **scoring.py:** add scarcity, airport arbitrage, fare brand value components
3. **scan_route_dag_factory.py:** wire `generate_events` between score_deal and ai_analysis
4. **scan_route_dag_factory.py:** replace action-branch guard on Duffel/Awards with schedule-check

Each of these is independent. Can be done in any order.

### Week 2: Make the frontend production-grade

5. **i18n.js:** complete the STRINGS catalog (add all component strings — full list documented in §6.3)
6. **26 components:** swap hardcoded text for `t()` calls — start with: AddRouteModal, FareDetailPanel, RouteCard, EventDetailDrawer (highest visible impact)
7. **Delete** AirportCompare.jsx, PriceHistory.jsx; route ScanHistory to `/settings` developer section; move AlertSettings into RouteDetail route-scoped panel
8. **docker-compose.yml:** frontend target → `prod`; add health checks; add `VITE_VAPID_PUBLIC_KEY`
9. **nginx/conf.d/default.conf:** SSL block + redirect + proxy_read_timeout 180s

---

## 12. Notes on extending the system

### Adding a new data source
1. Create `backend/app/services/{source}_client.py` — mirror pattern from `serpapi_client.py` or `duffel_client.py`
2. Add a new hypertable in a numbered migration
3. Add a `fetch_{source}` task in `dags/tasks/`
4. Wire it into the DAG factory with the same enrichment trigger logic as Duffel
5. Add its signal to `cross_reference.py`
6. Add its badge to `frontend/src/lib/colors.js` SOURCE_COLORS and `SourceBadges.jsx`

### Adding a new route event type
1. Add the type string to `route_event.py` (the EventType enum)
2. Add detection logic to `event_generator.py`
3. Add the label to `frontend/src/components/TimelineEvent.jsx` EVENT_TYPE_LABEL map
4. Add an i18n key to `i18n.js` STRINGS
5. Add a severity + color assignment to `frontend/src/lib/colors.js` SEVERITY_COLORS

### Adding a new scoring component
1. Write the function in `backend/app/services/scoring.py` (0 → max points, no hardcoded thresholds)
2. Add it to the `score_breakdown` dict returned by `calculate_score()`
3. Adjust normalization: `raw_total / new_max * 10`
4. Add a SHAP-style driver entry to `score_explainer.py`
5. Add the label to `ScoreExplainer.jsx` and `i18n.js`

### Deploying to Hostinger EasyPanel
1. SSH into KVM 2; install Docker + docker-compose
2. Clone repo; copy `.env.example` → `.env`; fill all required values
3. `docker compose build && docker compose up -d`
4. Point domain → server IP in Hostinger DNS
5. Generate Let's Encrypt cert: `docker run certbot/certbot certonly --webroot -w /var/www/html -d your-domain.com`
6. Mount certs at `./nginx/ssl/` and uncomment SSL block in nginx config
7. `docker compose restart nginx`
8. Verify: Airflow UI at `:8080`, backend at `https://domain/api/docs`, frontend at `https://domain/`

---

## 13. Things deliberately not in scope here

- **Grafana provisioning** — internal ops tool, no user-facing impact
- **Let's Encrypt automation** (certbot auto-renew hook) — manual setup is fine for a personal server; automate post-launch
- **Horizontal scaling** — the Hostinger KVM 2 is a single-node deployment; Airflow LocalExecutor is correct for this scale
- **New data sources** — per CLAUDE.md §API Rationalization, all major alternatives were evaluated in April 2026 and rejected
- **A/B testing, feature flags** — out of scope for a personal monitoring tool
- **Mobile apps** — the web app is responsive; native apps aren't planned

---

*End of document. Last updated: April 20, 2026. Re-run the Explorer agent after any structural change to keep this current.*
