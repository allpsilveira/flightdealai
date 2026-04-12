# CLAUDE.md — FlyLuxuryDeals Project Instructions

> Claude Code: Read this file completely before doing anything. This is the master specification.

---

## What This Is

FlyLuxuryDeals is a personal luxury travel deal intelligence platform. It monitors Business, First, and Premium Economy class fares across 3 data sources, scores deals using dynamic statistics, compares cash vs award miles, overlays cabin quality context, and delivers recommendations via a beautiful web dashboard + WhatsApp alerts.

**Owner:** Gabriel — dual US-Brazilian citizen based in Fort Myers, FL. Primary corridor is MIA/MCO/FLL → GRU/CNF but the system supports any route added dynamically through the UI.

**Design philosophy:** Minimal and elegant — luxury travel concierge aesthetic. NOT a generic dashboard. Think Amex Centurion lounge, not Bloomberg terminal.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.12 + FastAPI (async) |
| Database | PostgreSQL 16 + TimescaleDB extension |
| ORM | SQLAlchemy 2.0 + Alembic migrations |
| Orchestration | Apache Airflow 2.x (LocalExecutor) |
| Frontend | React 18 + Vite + Tailwind CSS |
| State | Zustand |
| Auth | JWT (access + refresh tokens) |
| Real-time | WebSockets (FastAPI native) |
| Charts | Recharts |
| Maps | MapLibre GL JS (free, open-source) or Leaflet with elegant styling |
| Alerts | Twilio WhatsApp Business API + Web Push API |
| AI | Anthropic Claude API (Sonnet for routine, Opus for complex) |
| Containers | Docker + docker-compose |
| Proxy | Nginx (SSL via Let's Encrypt) |
| Server | Hostinger KVM 2 (2 vCPU, 8GB RAM, 100GB NVMe, Ubuntu) |

---

## Data Sources (3 Active)

> **Note:** Amadeus self-service was decommissioned July 2026. Kiwi Tequila closed public registration.
> Stack is 3 confirmed working sources: SerpApi + Duffel + Seats.aero.
> Amadeus and Kiwi tables (`amadeus_prices`, `kiwi_prices`) remain in the DB for historical data but
> are no longer written to. Do not add code that references them.

### Source 1: SerpApi (Google Flights) — PRIMARY SCANNER
- **Role:** Only scheduled scan source. Runs every 4h (quick price check) and 3x daily (full scan with trend data). Also parses **all individual offers** (per airline + stop count) to populate `flight_offers` table.
- **Auth:** `api_key` query param
- **Cost:** $25/month (Starter — 1,000 searches/month)
- **Key unique data:** `price_insights.price_level` (low/typical/high), `price_insights.typical_price_range`, `price_insights.price_history`, all offers with airline + stops + duration
- **Cabin codes:** 1=Economy, 2=Premium Economy, 3=Business, 4=First
- **What we extract from each offer:** `price`, `flights[].airline_logo` (→ IATA), `total_duration`, stop count = `len(flights) - 1`
- **Stored per scan:** one `GooglePrice` row (overall cheapest) + N `FlightOffer` rows (cheapest per airline+stops combo)
- **Search params:**
```python
{
    "engine": "google_flights",
    "api_key": serpapi_key,
    "departure_id": origin, "arrival_id": dest,
    "outbound_date": date, "type": "2",  # one-way
    "travel_class": "3",  # 3=business, 4=first, 2=premium_economy
    "stops": "2", "currency": "USD", "hl": "en"
}
```

### Source 2: Duffel — DIRECT AIRLINE BOOKING PRICE
- **Role:** Returns cash price via airline GDS with fare brand name ("Business Lite"), conditions, refundability, expiry. Used for the price comparison panel (SerpApi price vs Duffel direct price vs award). Runs once daily at 7 AM and on every "Scan Now" action.
- **Auth:** Bearer token
- **Python SDK:** `duffel-api`
- **Cost:** $0.005/search (~$2.25/month for 1 route x 15 combos/day)
- **Key unique data:** `fare_brand_name`, `fare_basis_code`, `expires_at`, `conditions` (refund/change policies + penalties), `available_services`, `baggages`
- **Rate limit:** 120 requests/60 seconds
- **Search params:**
```python
duffel.offer_requests.create({
    "slices": [{"origin": origin, "destination": dest, "departure_date": date}],
    "passengers": [{"type": "adult"}],
    "cabin_class": cabin,  # "business", "first", "premium_economy"
    "max_connections": 1
})
```

### Source 3: Seats.aero — AWARD AVAILABILITY
- **Role:** Award/miles availability across 24 loyalty programs. Shown alongside cash prices in the deal detail price comparison panel. Runs once daily at 7 AM and on every "Scan Now" action.
- **Auth:** `Partner-Authorization: pro_xxxxx` header
- **Cost:** $10/month (Pro subscription, flat)
- **Rate limit:** 1,000 API calls/day
- **Key data:** loyalty program, miles cost, cash taxes, seats available, operating airline, transfer partners
- **Endpoints:** Cached Search, Bulk Availability, Get Trips

### Enrichment Layer: Cabin Quality Database (static JSON)
- Curated mapping: airline + aircraft → product name, quality score (1-100), seat type, has_door, lie_flat, bed_length, seat_width, configuration
- Referenced when deal cards are generated to add cabin context

### Enrichment Layer: Transfer Partner Database (static JSON)
- Maps credit card programs → airline loyalty programs with transfer ratios
- Referenced when award availability is found

### API Rationalization — Evaluated and Rejected Sources
The following APIs were evaluated in April 2026 and rejected. Do not integrate any of them:
- **Aviation Edge** ($299/mo): Flight tracking/schedules only, no pricing data.
- **Aviationstack** ($49.99/mo): Flight tracking/status only, no pricing data.
- **OAG** ($249/mo): Airline schedules, enterprise-grade. No pricing data.
- **Flightradar24**: Real-time aircraft positions only. No pricing data.
- **FlightAPI.io** ($49/mo): Returns OTA prices but WITHOUT price_insights/trend data. SerpApi does this better for $25/mo.
- **RapidAPI Flight Collection**: Marketplace aggregator, no unique value over current stack.

---

## Scanning Strategy (Cost-Optimized)

```
TIER 1 — SCHEDULED PRICE SCAN (SerpApi, $25/mo flat):
  Every 4h  → quick price check only
  3x/day    → full scan: price + price_level + price_history + typical_range + all offers

TIER 2 — DAILY ENRICHMENT (fires once at 7 AM for all active routes):
  Duffel     → direct airline cash price, fare brand, conditions
  Seats.aero → award availability + CPP calculation

TIER 3 — ON-DEMAND ("Scan Now" button):
  All three sources fire immediately

TOTAL: ~$37/month all-in
```

---

## Dynamic Scoring Engine (ALL thresholds derived from data)

**No hardcoded price thresholds. Everything is percentile/z-score based.**

### Cash Score (0-120 points):
1. **Percentile Position (0-30):** Bottom 5%=30, 10%=25, 20%=20, 30%=15, 40%=10, median=5, above=0
2. **Z-Score Signal (0-20):** >=2.5=20 (anomaly), >=2.0=16, >=1.5=12, >=1.0=8, >=0.5=4
3. **Google Trend Alignment (0-15):** Price vs typical_price_range midpoint. +3 if price_level="low", -3 if "high"
4. **Trend Direction (0-10):** 7-day slope. Falling fast=10, dropping=7, stable=3, rising=0, spiking=-5
5. **Cross-Source Validation (0-20):** Sources confirming low: 4=20, 3=16, 2=12, 1(GEM)=15, disagree=5
6. **Airport Arbitrage (0-10):** Savings >30%=10, >20%=7, >10%=5
7. **Fare Brand Value (0-10):** Business Lite >30% below standard = 10
8. **Scarcity (0-5):** 1 seat=5, <=3=4, <=5=2, <=10=1

### Award Score (0-50 bonus):
1. **CPP Value (0-20):** >=5x baseline=20, >=3x=15, >=2x=10
2. **Award Scarcity (0-15):** 1 seat=15, 2=10, <=4=5
3. **Program Accessibility (0-15):** Transferable from 3+ programs=15, 2=12, 1=8

### Actions:
- 100+ → STRONG_BUY (all alerts fire)
- 80-99 → BUY (primary alerts)
- 60-79 → WATCH (dashboard only)
- 40-59 → NORMAL (log)
- <40 → SKIP
- z-score >2.5 → POSSIBLE ERROR FARE → always alert

---

## Apache Airflow DAG Architecture

### Main DAG (per route, per cabin class — dynamically generated):
```
fetch_serpapi → cross_reference → score_deal → generate_events → branch_score
                                                                      |
                                                          +-----------+-----------+
                                                        >=50                     <50
                                                          |                       |
                                                     ai_analysis             log_skip
                                                          |
                                                    branch_action
                                                          |
                                          +---------------+---------------+
                                      BUY/GEM                         WATCH/NORMAL
                                          |                               |
                                    enrich_duffel                  update_dashboard
                                          |
                                    enrich_awards
                                          |
                                    dispatch_alerts
                                          |
                                    update_priority
```

**Key Airflow features:** BranchPythonOperator, XCom, trigger_rule=NONE_FAILED_MIN_ONE_SUCCESS, retries=3 with exponential backoff, SLA monitoring (5 min), dynamic DAG generation, HOT/WARM/COLD schedules.

### Secondary DAGs:
- **weekly_briefing:** Monday 7 AM — Claude AI market summary via WhatsApp
- **stats_refresh:** Every 6h — refreshes TimescaleDB continuous aggregates
- **cabin_quality_refresh:** Monthly — Claude reviews cabin DB
- **cheapest_date_scan:** Daily 6 AM — SerpApi samples next 60 days

---

## Database Schema

### PostgreSQL + TimescaleDB

**Regular tables:** users, routes, alert_rules, cabin_quality, transfer_partners, program_baselines

**Hypertables:** google_prices, flight_offers, duffel_prices, award_prices, deal_analysis

**Dead tables (do not write to):** amadeus_prices, kiwi_prices

**Continuous aggregates:** google_price_hourly, price_daily_stats

### Route Events Table (powers Zillow-style timeline)
```sql
CREATE TABLE route_events (
    id SERIAL PRIMARY KEY,
    route_id UUID REFERENCES routes(id),
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    event_type VARCHAR(30) NOT NULL,
    -- Types: 'price_drop', 'price_rise', 'error_fare', 'award_opened',
    --        'award_closed', 'airport_arbitrage', 'trend_reversal',
    --        'new_low', 'stable', 'monitoring_started', 'fare_brand_detected',
    --        'scarcity_alert', 'ai_insight'
    severity VARCHAR(10) DEFAULT 'info',
    -- 'critical' (error fare), 'high' (big drop/award), 'medium', 'low', 'info'
    headline TEXT NOT NULL,
    detail TEXT,
    subtext TEXT,
    airline VARCHAR(50),
    price_usd DECIMAL,
    previous_price_usd DECIMAL,
    deal_analysis_id INTEGER,
    metadata JSONB
);
CREATE INDEX idx_route_events_route ON route_events(route_id, timestamp DESC);
```

The scoring engine writes to this table after every scan. Only significant events are created — collapse "no change" scans into max 1 "stable" event per day.

---

## Frontend Architecture — 3 Levels + Settings

The app is route-centric. Everything revolves around tracked routes.

### Global Header (all pages)
- Logo: "FlyLuxuryDeals" in serif font
- Language flags: US (English), Spain (Spanish), Brazil (Portuguese). Active = full opacity, inactive = dimmed. Click switches all text + AI output + WhatsApp language.
- Navigation: Home | Settings
- User avatar / logout

### LEVEL 1: Home — My Routes

Route cards sorted by urgency (highest-score first). Each card shows:
- Route + cabin + dates + trip type
- Current best price + airline + trend arrow
- Score badge + special flags (Error fare?, Google: LOW, Award available)
- Latest event preview (one-liner from timeline)
- Left border color = urgency (red=critical, green=deal, gold=award, default=neutral)
- Click → Level 2

**Top bar:** Route count, last scan time, "+ Add route" button, cabin class filter pills.

### Route Creation Modal (from "+ Add route")
1. Origin airport(s) — IATA autocomplete, multi-select
2. Destination airport(s) — same
3. Trip type — Round trip / Two one-ways / Monitor both (recommended default)
4. Cabin class — multi-select: Business / First / Premium Economy
5. Dates — Specific date / Date range / Flexible (next 60/90 days)
6. Confirmation — Summary + estimated monthly cost + "Start monitoring"

### LEVEL 2: Route Detail

Two-column layout. Left ~60%, Right ~40%.

**Left column:**

**Price chart (top, always visible):**
- Recharts line/area chart, daily lows per airline (color-coded lines)
- p10-p90 shaded percentile band + Google typical_price_range overlay
- Current price dot + label. Hover tooltips. Time range toggle (7d/30d/60d/90d).
- Below: cheapest-date calendar strip, color-coded (green=cheap, red=expensive)

**Activity timeline (below chart, scrollable):**
- Zillow-style vertical event feed from route_events table
- Each event: severity dot on timeline line, timestamp, type label, headline, detail, subtext
- Severity colors: red=error fare, gold=award, green=price drop, blue=info, grey=stable
- Click event → opens Level 3 ticket detail panel

**Right column:**

**Airline leaderboard:** Sorted by price. Each row: airline, price, change indicator, stops, duration, historical low. Click → highlights chart line + opens Level 3.

**Best award option:** Program, miles, taxes, CPP value, transfer source.

**AI insight:** Claude recommendation in user's language.

**Trip comparison (if "monitor both"):** Round trip vs two one-ways with savings.

**Route header:** Route name, score, Google badge, "Scan Now" button, edit/pause/delete, per-route alert overrides.

### LEVEL 3: Ticket Detail (slide-in panel from right)

Triggered by clicking airline row, timeline event, or chart price point.

**Fare details:** Airline, price, fare brand, cabin quality badge, conditions, baggage, offer expiry, "Book now" link.

**Airport comparison (embedded, NOT a separate page):** Mini-map with origin airports + price pins. Table: airport, price, difference, drive time. "Save $340 from MCO" highlight.

**Award comparison (if available):** Cash vs miles side-by-side, CPP calculation, transfer partners, "saves $X vs cash" verdict.

### SETTINGS (single page)

**Account:** Email, password, WhatsApp number, language.
**Notifications:** WhatsApp/push/email toggles, default score threshold, error fare alerts, award alerts.
**Display:** Currency, date format.

Route-specific alert overrides live on Route Detail, not here.

### Pages/Tabs that do NOT exist:
- No Airport Comparison page (embedded in Level 3)
- No Alert Settings page (merged into Settings)
- No Route Manager page (CRUD via Home + Route Detail)
- No separate Deal Feed page (Home IS the feed)

---

## Project Structure

```
flightdeal-ai/
├── CLAUDE.md
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── models/
│   │   ├── api/
│   │   │   ├── auth.py
│   │   │   ├── routes.py
│   │   │   ├── deals.py
│   │   │   ├── prices.py
│   │   │   ├── awards.py
│   │   │   ├── events.py
│   │   │   ├── airports.py
│   │   │   ├── cabins.py
│   │   │   ├── alerts.py
│   │   │   └── ws.py
│   │   ├── services/
│   │   │   ├── serpapi_client.py
│   │   │   ├── duffel_client.py
│   │   │   ├── seats_aero_client.py
│   │   │   ├── cross_reference.py
│   │   │   ├── scoring.py
│   │   │   ├── stats.py
│   │   │   ├── event_generator.py
│   │   │   ├── ingestion.py
│   │   │   ├── scanner.py
│   │   │   ├── deal_pipeline.py
│   │   │   ├── award_analyzer.py
│   │   │   ├── claude_advisor.py
│   │   │   ├── whatsapp.py
│   │   │   └── web_push.py
│   │   └── data/
│   │       ├── cabin_quality.json
│   │       ├── transfer_partners.json
│   │       ├── program_baselines.json
│   │       └── airports.json
├── dags/
│   ├── scan_route_dag_factory.py
│   ├── tasks/
│   │   ├── fetch_serpapi.py
│   │   ├── fetch_duffel.py
│   │   ├── fetch_awards.py
│   │   ├── cross_reference.py
│   │   ├── score_deal.py
│   │   ├── generate_events.py
│   │   ├── ai_analysis.py
│   │   ├── dispatch_alerts.py
│   │   └── update_priority.py
│   ├── weekly_briefing_dag.py
│   ├── stats_refresh_dag.py
│   ├── cheapest_date_dag.py
│   └── cabin_quality_refresh_dag.py
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.js
│   ├── src/
│   │   ├── App.jsx
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Home.jsx
│   │   │   ├── RouteDetail.jsx
│   │   │   └── Settings.jsx
│   │   ├── components/
│   │   │   ├── GlobalHeader.jsx
│   │   │   ├── RouteCard.jsx
│   │   │   ├── AddRouteModal.jsx
│   │   │   ├── PriceChart.jsx
│   │   │   ├── CheapestDateStrip.jsx
│   │   │   ├── ActivityTimeline.jsx
│   │   │   ├── TimelineEvent.jsx
│   │   │   ├── AirlineLeaderboard.jsx
│   │   │   ├── AirlineRow.jsx
│   │   │   ├── TicketDetailPanel.jsx
│   │   │   ├── AirportComparison.jsx
│   │   │   ├── AwardComparison.jsx
│   │   │   ├── CabinQualityBadge.jsx
│   │   │   ├── ScoreBadge.jsx
│   │   │   ├── TrendArrow.jsx
│   │   │   ├── AIInsightPanel.jsx
│   │   │   ├── TripTypeComparison.jsx
│   │   │   └── LanguageSwitcher.jsx
│   │   └── stores/
│   │       ├── useRoutes.js
│   │       ├── useEvents.js
│   │       ├── useAuth.js
│   │       └── useSettings.js
├── nginx/
│   └── conf.d/default.conf
└── grafana/
    └── provisioning/
```

---

## Environment Variables (.env)

```
DB_PASSWORD=
POSTGRES_DB=flightdeal
AIRFLOW_ADMIN_PASSWORD=
AIRFLOW_FERNET_KEY=
AIRFLOW_SECRET_KEY=
SERPAPI_API_KEY=
DUFFEL_API_KEY=
SEATS_AERO_API_KEY=
ANTHROPIC_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_CLAIM_EMAIL=
JWT_SECRET=
APP_DOMAIN=
```

---

## Key Rules for Claude Code

1. **Keep the existing design skeleton.** Deep navy/charcoal + gold/champagne + serif headings. Do NOT change colors, fonts, or visual identity. Improve animations, transitions, shadows, and spacing — but keep the same look.
2. **Never hardcode price thresholds.** All scoring is percentile/z-score based.
3. **Backend is async throughout.** Use `async def` for all FastAPI routes and service methods.
4. **Airflow tasks must be idempotent.** Re-running a task should not create duplicate data.
5. **All API clients must handle failures gracefully.** Return None on failure, log the error, let the pipeline continue with partial data.
6. **Use XCom for passing data between Airflow tasks.** Keep payloads small.
7. **Store raw API responses in a separate table** for debugging.
8. **Trilingual support:** EN/ES/PT. Use i18n — do not hardcode English strings in components.
9. **Cost-conscious scanning:** Duffel and Seats.aero run once daily at 7 AM + on "Scan Now". SerpApi is the only scheduled scanner.
10. **Docker-first.** Everything runs in Docker.
11. **Route-centric architecture.** No standalone feature pages. Everything accessed through a route.
12. **Airport comparison is NEVER a separate page.** Embedded in Level 3 Ticket Detail panel.
13. **Alert settings are NEVER a separate page.** Merged into Settings. Route overrides on Route Detail.
14. **Every scan cycle generates events.** Write to route_events for significant changes. Max 1 "stable" event per day for no-change scans.
15. **Grafana is internal only.** Users never see it. All user-facing charts use Recharts.
