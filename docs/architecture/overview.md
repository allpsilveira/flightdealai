# System Architecture Overview

FlyLuxuryDeals monitors Business, First, and Premium Economy fares across three data sources, scores deals using dynamic statistical thresholds, and delivers recommendations through a web dashboard and WhatsApp alerts.

---

## Three-Tier Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  TIER 1 — DATA SOURCES                                              │
│                                                                     │
│   SerpApi (Google Flights)  ─── primary scanner, price trends       │
│   Duffel (Airline GDS)      ─── direct fares, fare brand, T&Cs      │
│   Seats.aero                ─── award/miles availability            │
└───────────────────────┬─────────────────────────────────────────────┘
                        │  raw price rows → TimescaleDB hypertables
┌───────────────────────▼─────────────────────────────────────────────┐
│  TIER 2 — INTELLIGENCE ENGINE                                       │
│                                                                     │
│   Cross-reference engine    ─── GEM detection, source agreement     │
│   Rolling stats (TimescaleDB) ── percentiles p5–p90, z-score, slope │
│   Dynamic scoring engine    ─── 0–10 point deal score               │
│   Award analyzer            ─── CPP calculation, transfer partners  │
│   Claude AI advisor         ─── plain-language recommendation       │
│   Event generator           ─── writes to route_events timeline     │
│   Apache Airflow            ─── orchestrates all of the above       │
└───────────────────────┬─────────────────────────────────────────────┘
                        │  deal_analysis rows → FastAPI
┌───────────────────────▼─────────────────────────────────────────────┐
│  TIER 3 — DELIVERY LAYER                                            │
│                                                                     │
│   React dashboard      ─── route cards, charts, timeline, modals   │
│   WebSocket live feed  ─── real-time score updates                  │
│   Twilio WhatsApp      ─── BUY / STRONG_BUY / GEM alerts           │
│   Web Push (VAPID)     ─── browser notifications                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Sources

See [reference/data-sources.md](../reference/data-sources.md) for full auth, rate limits, and request shapes.

### SerpApi — Primary Scanner

- **Role:** The only *scheduled* scan source. Runs every 4 h (quick price check) and 3× daily (full trend scan with `price_insights`).
- **Unique value:** `price_level` (low/typical/high), `typical_price_range`, `price_history`, and every individual offer per airline + stop-count grouping.
- **Cost:** $25/month flat (Starter — 1,000 searches/month).
- **Produces:** one `google_prices` row (overall best) + N `flight_offers` rows (cheapest per airline/stops combo) per scan.

### Duffel — Direct Airline Booking Price

- **Role:** Enrichment only. Fires once daily at 7 AM and on every "Scan Now".
- **Unique value:** `fare_brand_name` (e.g. "Business Lite"), `expires_at`, refund/change conditions, baggage.
- **Cost:** ~$2.25/month at current volume.
- **Produces:** one `duffel_prices` row per route–cabin–date combination.

### Seats.aero — Award Availability

- **Role:** Enrichment only. Fires once daily at 7 AM and on every "Scan Now".
- **Unique value:** Miles cost + cash taxes across 24 loyalty programs. Enables Cents-Per-Point (CPP) calculations and transfer-partner mapping.
- **Cost:** $10/month flat (Pro subscription).
- **Produces:** N `award_prices` rows (one per loyalty program offering availability).

### Decommissioned Sources

| Source | Reason Removed |
|--------|---------------|
| Amadeus self-service | Decommissioned July 2026 |
| Kiwi Tequila | Closed public registration |

Tables `amadeus_prices` and `kiwi_prices` remain in the database for historical data but are **never written to**.

---

## Airflow Orchestration

Every active `(route, cabin_class)` pair gets its own dynamically generated Airflow DAG. The DAG factory (`dags/scan_route_dag_factory.py`) reads active routes from the database on startup.

### Scan DAG — Task Flow

```
fetch_serpapi
     │
     ▼
cross_reference ──────────────────────────────────────────┐
     │                                                     │
     ▼                                                     │
score_deal                                                 │
     │                                                     │
     ▼                                                     │
generate_events  ← [⚠ NOT YET IMPLEMENTED — see ADR-0003] │
     │                                                     │
     ▼                                                     │
branch_score                                               │
  ├── score < 3.0 ─→ log_skip ──────────────────────────►─┤
  └── score ≥ 50 ──→ ai_analysis                          │
                          │                                │
                          ▼                                │
                     branch_action                         │
                  ├── WATCH/NORMAL ──→ update_dashboard ──►┤
                  └── BUY/GEM ──→ enrich_duffel            │
                                       │                   │
                                       ▼                   │
                                 enrich_awards             │
                                       │                   │
                                       ▼                   │
                                 dispatch_alerts           │
                                       │                   │
                                       ▼                   │
                                 update_priority ◄─────────┘
```

### Scan Schedule (Priority Tiers)

| Tier | Interval | Trigger |
|------|----------|---------|
| HOT | Every 2 h | Route with recent BUY/GEM action |
| WARM | Every 4 h | Default for active routes |
| COLD | Every 8 h | Routes with no recent activity |

`update_priority` promotes/demotes routes between tiers after every scan cycle.

### Secondary DAGs

| DAG | Schedule | Purpose |
|-----|----------|---------|
| `weekly_briefing_dag` | Monday 7 AM | Claude AI market summary via WhatsApp |
| `stats_refresh_dag` | Every 6 h | Refreshes TimescaleDB continuous aggregates |
| `cheapest_date_dag` | Daily 6 AM | SerpApi samples next 60 days for cheapest dates |
| `cabin_quality_refresh_dag` | 1st of month | Claude reviews cabin quality database for updates |

---

## Scanning Strategy (Cost Model)

Total cost: **~$37/month** across three sources.

```
TIER 1 — SCHEDULED (SerpApi only, $25/mo flat):
  Every 4 h  → quick price check, no enrichment
  3× daily   → full scan: price + trends + all individual offers

TIER 2 — DAILY ENRICHMENT (fires once at 7 AM for all active routes):
  Duffel     → fare brand, conditions (~$2.25/mo at 1 active route)
  Seats.aero → award availability + CPP calculation ($10/mo flat)
  Not score-gated — runs for every route+cabin+date combo.

TIER 3 — ON-DEMAND ("Scan Now" button):
  All three sources fire immediately: SerpApi + Duffel + Seats.aero.
```

`force_enrich=False` → SerpApi 4 h quick scan only.
`force_enrich=True` → daily 7 AM enrichment or "Scan Now" — always enriches.

---

## Cold-Start Strategy

The scoring engine needs 30 days of own data to be self-sufficient. Bootstrap phases:

| Days | Strategy |
|------|----------|
| 0–3 | `price_insights.typical_price_range` from SerpApi only. No scoring. Data collection mode. |
| 4–14 | Blend SerpApi trends + emerging own data. Conservative scoring. |
| 15–30 | 50/50 blend of SerpApi trends and own TimescaleDB percentiles. |
| 30+ | Self-sufficient. All scoring from own rolling statistics. |

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.12 + FastAPI (fully async) |
| Database | PostgreSQL 16 + TimescaleDB extension |
| ORM | SQLAlchemy 2.0 (asyncio) + Alembic migrations |
| Orchestration | Apache Airflow 2.9 (LocalExecutor) |
| Frontend | React 18 + Vite + Tailwind CSS |
| State | Zustand |
| Auth | JWT (access + refresh tokens) |
| Real-time | WebSockets (FastAPI native) |
| Charts | Recharts |
| Maps | MapLibre GL JS |
| Alerts | Twilio WhatsApp Business API + Web Push (VAPID) |
| AI | Anthropic Claude API (claude-3-5-sonnet) |
| Containers | Docker + docker-compose |
| Proxy | Nginx (SSL via Let's Encrypt) |

---

## Related

- [Data model](data-model.md) — table schemas and relationships
- [Data sources reference](../reference/data-sources.md) — auth, rate limits, request shapes
- [ADR-0001: Dynamic scoring](../decisions/0001-dynamic-scoring.md) — why percentile/z-score
- [ADR-0002: API stack](../decisions/0002-api-stack.md) — why these three sources
