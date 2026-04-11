# CLAUDE.md — FlightDeal AI Project Instructions

> Claude Code: Read this file completely before doing anything. This is the master specification.

---

## What This Is

FlightDeal AI is a personal luxury travel deal intelligence platform. It monitors Business, First, and Premium Economy class fares across 5 data sources, cross-references them, scores deals using dynamic statistics, compares cash vs award miles, overlays cabin quality context, and delivers recommendations via a beautiful web dashboard + WhatsApp alerts.

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

## Data Sources (5 Total)

### Source 1: Amadeus Self-Service — FREE TRIPWIRE (runs every 2 hours)
- **Role:** Continuous price monitoring at zero cost. Detects price changes. Provides seats remaining, booking class letters, cheapest date calendar.
- **Auth:** OAuth2 (client_id + client_secret)
- **Python SDK:** `amadeus`
- **Key endpoints:** Flight Offers Search (cabin filter: BUSINESS, FIRST, PREMIUM_ECONOMY), Flight Cheapest Date Search
- **Key unique data:** `numberOfBookableSeats`, `booking_class` letter (J/C/D/Z), `brandedFare`, cheapest price per day in a month
- **Free tier:** 2,000-10,000 calls/month depending on endpoint
- **Search params:**
```python
amadeus.shopping.flight_offers_search.get(
    originLocationCode=origin, destinationLocationCode=dest,
    departureDate=date, adults=1, travelClass=cabin,
    nonStop=False, max=20, currencyCode="USD"
)
```

### Source 2: SearchApi.io (Google Flights) — TREND INTELLIGENCE (runs 3x/day + on-demand)
- **Role:** Only source of Google's price trend data. Returns price_level (low/typical/high), typical_price_range, price_history (weeks of timestamped prices).
- **Auth:** API key as query param or Bearer header
- **Cost:** $40/month for 10,000 searches
- **Key unique data:** `price_insights.price_level`, `price_insights.typical_price_range`, `price_insights.price_history`, booking options with OTA pricing
- **Search params:**
```python
{
    "engine": "google_flights",
    "departure_id": origin, "arrival_id": dest,
    "outbound_date": date, "type": "2",  # one-way
    "travel_class": "3",  # 3=business, 4=first, 2=premium_economy
    "stops": "2", "currency": "USD", "deep_search": "true"
}
```

### Source 3: Kiwi.com Tequila — CREATIVE ROUTING (runs 3x/day)
- **Role:** Finds routes nobody else shows via Virtual Interlining. Accepts multiple origins+destinations in one call.
- **Auth:** API key in `apikey` header
- **Cost:** Free
- **Key unique data:** `virtual_interlining` flag, `has_airport_change`, `technical_stops`, `deep_link` for booking
- **Endpoint:** `https://tequila-api.kiwi.com/v2/search`
- **Search params:**
```
fly_from=MIA,MCO,FLL&fly_to=GRU,CNF&date_from={start}&date_to={end}
&flight_type=oneway&selected_cabins=C&max_stopovers=2&curr=USD&sort=price&limit=20
```
- **Cabin codes:** M=economy, W=premium_economy, C=business, F=first

### Source 4: Duffel — FARE BRAND DETAIL (on-demand, when deal detected)
- **Role:** Only source of fare brand names ("Business Lite"), offer expiry timestamps, detailed conditions, ancillaries. Fires when Amadeus/SearchApi detects a potential deal.
- **Auth:** Bearer token
- **Python SDK:** `duffel-api`
- **Cost:** $0.005/search (on-demand only = ~$1.50-5/month)
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

### Source 5: Seats.aero — AWARD AVAILABILITY (on-demand, when deal detected)
- **Role:** Award/miles availability across 24 loyalty programs. When a cash deal is found, check if the same route has award space and calculate cents-per-point value.
- **Auth:** `Partner-Authorization: pro_xxxxx` header
- **Cost:** $10/month (Pro subscription, flat)
- **Rate limit:** 1,000 API calls/day
- **Key data:** loyalty program, miles cost, cash taxes, seats available, operating airline, transfer partners
- **Endpoints:** Cached Search, Bulk Availability, Get Trips

### Enrichment Layer: Cabin Quality Database (static JSON)
- Curated mapping: airline + aircraft → product name, quality score (1-100), seat type, has_door, lie_flat, bed_length, seat_width, configuration
- Top entries: Qatar Qsuite (98), ANA The Room (95), JAL Sky Suite III (96), Singapore Business (94), Cathay Aria Suite (95), etc.
- Referenced when deal cards are generated to add cabin context

### Enrichment Layer: Transfer Partner Database (static JSON)
- Maps credit card programs → airline loyalty programs with transfer ratios
- Chase UR → Aeroplan 1:1, Amex MR → Smiles 1:1, Capital One → Avianca LifeMiles 1:1, etc.
- Referenced when award availability is found

---

## Scanning Strategy (Cost-Optimized)

**NOT brute-force. Intelligent tiered scanning.**

```
TIER 1 — TRIPWIRE (free/cheap, runs continuously):
  Amadeus: every 2 hours → detect price changes
  Kiwi: every 8 hours → detect creative routing opportunities

TIER 2 — DEEP SCAN (paid, runs on schedule + on-demand):
  SearchApi.io: 3x/day (morning, afternoon, night) → trend intelligence
  ALSO triggered when Tier 1 detects >5% price drop from last known

TIER 3 — ENRICHMENT (paid, on-demand only):
  Duffel: ONLY when a potential deal is detected → get fare brand, conditions, expiry
  Seats.aero: ONLY when a potential deal is detected → check award availability

COST PER ROUTE: ~$4-8/month
TOTAL FOR 5 ROUTES: ~$30-40/month + $10 Seats.aero flat + $7 Hostinger = ~$50/month
```

---

## Dynamic Scoring Engine (ALL thresholds derived from data)

**No hardcoded price thresholds. Everything is percentile/z-score based.**

### Cash Score (0-120 points):
1. **Percentile Position (0-30):** Where does price fall in 90-day distribution? Bottom 5%=30, 10%=25, 20%=20, 30%=15, 40%=10, median=5, above=0
2. **Z-Score Signal (0-20):** How many std devs below mean? ≥2.5=20 (anomaly/error fare), ≥2.0=16, ≥1.5=12, ≥1.0=8, ≥0.5=4
3. **Google Trend Alignment (0-15):** Price vs typical_price_range midpoint. Also +3 bonus if price_level="low", -3 if "high"
4. **Trend Direction (0-10):** 7-day slope. Falling fast=10, dropping=7, stable=3, rising=0, spiking=-5
5. **Cross-Source Validation (0-20):** How many sources confirm low price? 4=20, 3=16, 2=12, 1(GEM)=15, disagree=5
6. **Airport Arbitrage (0-10):** Savings % between best and worst airport. >30%=10, >20%=7, >10%=5
7. **Fare Brand Value (0-10):** Business Lite detected at >30% below standard = 10
8. **Scarcity (0-5):** 1 seat=5, ≤3=4, ≤5=2, ≤10=1

### Award Score (0-50 bonus, when available):
1. **CPP Value (0-20):** cash_price / miles_cost vs baseline CPP per program. ≥5x=20, ≥3x=15, ≥2x=10
2. **Award Scarcity (0-15):** 1 seat=15, 2=10, ≤4=5
3. **Program Accessibility (0-15):** Transferable from 3+ card programs=15, 2=12, 1=8

### Cold Start (first 30 days):
- Days 0-3: Use SearchApi typical_price_range only, no scoring, data collection mode
- Days 4-14: Blend SearchApi trends + emerging own data, conservative scoring
- Days 15-30: 50/50 blend
- Days 30+: Self-sufficient from own TimescaleDB percentiles

### Actions:
- 100+ → STRONG_BUY (all alerts fire)
- 80-99 → BUY (primary alerts)
- 60-79 → WATCH (dashboard only)
- 40-59 → NORMAL (log)
- <40 → SKIP
- GEM flag → always alert regardless of score
- z-score >2.5 → flag as POSSIBLE ERROR FARE → always alert

---

## Apache Airflow DAG Architecture

### Main DAG (per route, per cabin class — dynamically generated):
```
PARALLEL (all fire at once):
  fetch_amadeus ──────┐
  fetch_searchapi ────┤
  fetch_kiwi ─────────┼──→ cross_reference ──→ score_deal
                      │         │
                      │    ┌────┴────┐
                      │    │ Branch  │
                      │    └──┬───┬──┘
                      │  ≥50  │   │ <50
                      │       │   │
                      │  ai_analysis  log_skip
                      │       │
                      │  ┌────┴────┐
                      │  │ Branch  │
                      │  └──┬───┬──┘
                      │ ≥80  │   │ 50-79
                      │ /GEM │   │
                      │      │   │
                 enrich_duffel  update_dashboard
                 enrich_awards
                      │
                 dispatch_alerts
                      │
                 update_priority
```

**Key Airflow features used:**
- Parallel task execution (5 API calls simultaneously)
- BranchPythonOperator (conditional paths based on score)
- XCom (pass data between tasks)
- trigger_rule="none_failed" (graceful degradation if one API fails)
- retries=3 with exponential backoff per task
- SLA monitoring (10 min per cycle)
- Dynamic DAG generation (one DAG per active route from DB)
- Dataset-aware scheduling for secondary DAGs

### Secondary DAGs:
- **weekly_briefing:** Monday 7 AM, Claude AI market summary via WhatsApp
- **stats_refresh:** Triggered by new price data, recalculates percentiles
- **cabin_quality_refresh:** Monthly, Claude reviews cabin DB for updates
- **cheapest_date_scan:** Daily, Amadeus cheapest date endpoint per route

---

## Database Schema

### PostgreSQL + TimescaleDB

**Regular tables:** users, routes (with origins[], destinations[], cabin_classes[]), alert_rules, cabin_quality, transfer_partners, program_baselines

**Hypertables (time-series):** amadeus_prices, google_prices, kiwi_prices, duffel_prices, award_prices, deal_analysis

**Continuous aggregates:** price_hourly (per source), price_daily_stats (with percentiles p5/p10/p20/p25/p30/median/p75/p90, stddev, min)

See the full SQL schema in the Final v2 Specification document.

---

## Frontend — React + Vite + Tailwind

### Design Direction: Luxury Travel Concierge
- **Aesthetic:** Minimal, elegant, refined. Think Amex Platinum app meets Centurion Lounge.
- **Color palette:** Deep navy/charcoal backgrounds, warm gold/champagne accents, crisp white text. No bright colors except for deal score badges.
- **Typography:** Elegant serif for headings (e.g., Playfair Display, Cormorant Garamond), clean sans-serif for data (e.g., DM Sans, Outfit).
- **Motion:** Subtle, smooth transitions. No flashy animations. Content fades in gracefully.
- **Cards:** Frosted glass effect or subtle elevation. Generous whitespace. Never cluttered.
- **Maps:** Elegant dark-themed map with gold/champagne pins for airports, price labels overlaid.

### Pages:

**1. Dashboard (main — deal feed)**
- Live deal feed sorted by score, WebSocket updates
- Each deal card shows: price, score badge (color-coded), AI recommendation, price context ("bottom 8%, Google says LOW"), airport comparison ("MCO saves $700"), cabin quality badge, fare brand if detected, seats remaining, award alternative if available
- Filter bar: cabin class, airport, airline, score threshold, show GEMs only
- Map view toggle: see airports with current best prices overlaid

**2. Route Manager**
- Add route: origin airport(s), destination airport(s), cabin class(es), date range
- Edit/pause/delete routes
- Priority tier indicator (HOT/WARM/COLD)

**3. Price History**
- Route selector
- Recharts time-series with percentile bands (p10-p90 shaded)
- Google typical price range as overlay band
- Current price position marker
- Trend direction arrow
- Toggle between sources

**4. Airport Comparison**
- Map with MIA, MCO, FLL (or whatever airports) showing prices
- Side-by-side stats: current best, 30/60/90-day averages
- "Drive value" indicator

**5. Alert Settings**
- Per-route alert rules
- Score threshold, GEM alerts, scarcity alerts, trend reversal
- WhatsApp toggle + web push toggle
- Alert history

**6. Settings**
- Account (email, WhatsApp number)
- Language (English / Portuguese)
- Preferences

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
│   │   │   ├── airports.py
│   │   │   ├── cabins.py
│   │   │   ├── alerts.py
│   │   │   └── ws.py
│   │   ├── services/
│   │   │   ├── amadeus_client.py
│   │   │   ├── searchapi_client.py
│   │   │   ├── kiwi_client.py
│   │   │   ├── duffel_client.py
│   │   │   ├── seats_aero_client.py
│   │   │   ├── cross_reference.py
│   │   │   ├── scoring.py
│   │   │   ├── stats.py
│   │   │   ├── award_analyzer.py
│   │   │   ├── claude_advisor.py
│   │   │   └── whatsapp.py
│   │   └── data/
│   │       ├── cabin_quality.json
│   │       ├── transfer_partners.json
│   │       ├── program_baselines.json
│   │       └── airports.json
├── dags/
│   ├── scan_route_dag_factory.py
│   ├── tasks/
│   │   ├── fetch_amadeus.py
│   │   ├── fetch_searchapi.py
│   │   ├── fetch_kiwi.py
│   │   ├── fetch_duffel.py
│   │   ├── fetch_awards.py
│   │   ├── cross_reference.py
│   │   ├── score_deal.py
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
│   │   │   ├── Dashboard.jsx
│   │   │   ├── RouteManager.jsx
│   │   │   ├── PriceHistory.jsx
│   │   │   ├── AirportCompare.jsx
│   │   │   ├── AlertSettings.jsx
│   │   │   └── Settings.jsx
│   │   ├── components/
│   │   │   ├── DealCard.jsx
│   │   │   ├── ScoreBadge.jsx
│   │   │   ├── SourceBadges.jsx
│   │   │   ├── GemBadge.jsx
│   │   │   ├── CabinQualityBadge.jsx
│   │   │   ├── PriceChart.jsx
│   │   │   ├── AirportMap.jsx
│   │   │   ├── AwardComparison.jsx
│   │   │   ├── TrendArrow.jsx
│   │   │   └── ExpiryCountdown.jsx
│   │   └── stores/
│   │       ├── useDeals.js
│   │       ├── useAuth.js
│   │       └── useAlerts.js
├── nginx/
│   └── conf.d/default.conf
└── grafana/
    └── provisioning/
```

---

## Build Phases

### Phase 1: Foundation (Days 1-3)
- docker-compose.yml (PostgreSQL + TimescaleDB + Airflow + FastAPI + Nginx)
- SQLAlchemy models + Alembic migration
- TimescaleDB hypertables + continuous aggregates
- FastAPI skeleton with JWT auth
- React app scaffold with Tailwind + luxury theme + routing
- Login/Register pages
- .env.example

### Phase 2: Data Sources (Days 4-8)
- Amadeus client (tripwire scanner)
- SearchApi.io client (Google Flights with price_insights)
- Kiwi Tequila client (creative routing)
- Duffel client (on-demand fare brand detail)
- Seats.aero client (on-demand award check)
- Data normalization + storage to hypertables
- CLI test command for manual scan

### Phase 3: Intelligence Engine (Days 9-13)
- Rolling statistics calculator (TimescaleDB percentiles + z-scores)
- Cold-start bootstrap (SearchApi typical_range seed)
- Cross-reference engine (gem detection, match type classification)
- Dynamic scoring engine (120 cash + 50 award points)
- Award CPP calculator + transfer partner mapping
- Airport comparison logic
- Fare brand detection
- Cabin quality enrichment
- Claude AI advisor integration

### Phase 4: Airflow Orchestration (Days 14-17)
- DAG factory (dynamic DAG per route from DB)
- All task modules (fetch, xref, score, branch, ai, alert, priority)
- Parallel execution + branching logic
- XCom data flow
- Retry + SLA configuration
- Secondary DAGs (weekly briefing, stats refresh, cheapest date, cabin refresh)
- Airflow connection store for all API keys

### Phase 5: Web Application (Days 18-25)
- Dashboard with deal feed (WebSocket live updates)
- DealCard component (full data display, luxury styling)
- Map view with airport price overlays (MapLibre/Leaflet)
- Route Manager (add/edit/delete routes dynamically)
- Price History page (Recharts with percentile bands)
- Airport Comparison page
- Alert Settings page
- Settings page (language, WhatsApp number)
- Responsive design

### Phase 6: Alerts + Polish (Days 26-30)
- Twilio WhatsApp integration
- Web push notifications
- Alert dispatch logic + history
- Nginx SSL configuration
- Docker optimization
- Error handling + logging
- Performance testing

### Phase 7: Deploy to Hostinger (Days 31-35)
- SSH setup guidance (step-by-step for Gabriel)
- Docker install on KVM 2
- docker-compose up on server
- SSL certificates (Let's Encrypt)
- Domain + subdomain configuration
- Backup strategy
- Monitoring verification

---

## Environment Variables (.env)

```
# Database
DB_PASSWORD=
POSTGRES_DB=flightdeal

# Airflow
AIRFLOW_ADMIN_PASSWORD=
AIRFLOW_FERNET_KEY=

# APIs
AMADEUS_CLIENT_ID=
AMADEUS_CLIENT_SECRET=
SEARCHAPI_API_KEY=
KIWI_API_KEY=
DUFFEL_API_KEY=
SEATS_AERO_API_KEY=
ANTHROPIC_API_KEY=

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=

# App
JWT_SECRET=
APP_DOMAIN=
```

---

## Key Rules for Claude Code

1. **Always use the luxury concierge aesthetic** for frontend. Deep navy/charcoal, gold/champagne accents, elegant serif headings, generous whitespace.
2. **Never hardcode price thresholds.** All scoring is percentile/z-score based.
3. **Backend is async throughout.** Use `async def` for all FastAPI routes and service methods.
4. **Airflow tasks must be idempotent.** Re-running a task should not create duplicate data.
5. **All API clients must handle failures gracefully.** Return None on failure, log the error, let the pipeline continue with partial data.
6. **Use XCom for passing data between Airflow tasks.** Keep payloads small (IDs and scores, not full API responses).
7. **Store raw API responses in a separate table** for debugging, but work with normalized data in the main hypertables.
8. **Bilingual support:** All user-facing text (including AI recommendations) should respect the user's language preference (EN/PT).
9. **Cost-conscious scanning:** Never call Duffel or Seats.aero on a schedule. Only on-demand when a deal is detected or user requests a live scan.
10. **Docker-first:** Everything runs in Docker. No local Python installs needed on the server.
