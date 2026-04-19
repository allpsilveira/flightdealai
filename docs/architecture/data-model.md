# Data Model

FlyLuxuryDeals uses PostgreSQL 16 with the TimescaleDB extension. Regular tables store configuration and reference data; TimescaleDB hypertables store all time-series price and scoring data.

---

## Entity Relationship Overview

```
users
  │  1:N
  └──► routes ──────────────────────────────────┐
         │  1:N                                  │
         ├──► alert_rules                        │
         │                                       │ route_id FK
         │  (via route_id)                       │
         ├──► google_prices      (hypertable)    │◄─────────┐
         ├──► flight_offers      (hypertable)    │          │
         ├──► duffel_prices      (hypertable)    │          │
         ├──► award_prices       (hypertable)    │          │
         ├──► deal_analysis      (hypertable) ───┘          │
         ├──► scan_history                                   │
         └──► route_events  [⚠ NOT YET CREATED]             │
                                                             │
flight_offers.deal_analysis_id ──────────────────────────────┘
```

Reference tables (no FK, loaded from JSON):

```
cabin_quality        — airline + aircraft → product name, quality score
transfer_partners    — credit card programs → loyalty programs + ratios
program_baselines    — baseline CPP per loyalty program
```

---

## Regular Tables

### `users`

Stores account credentials and notification preferences.

```sql
id                  UUID        PRIMARY KEY
email               VARCHAR(255) UNIQUE NOT NULL
hashed_password     VARCHAR(255) NOT NULL
whatsapp_number     VARCHAR(20)
language            VARCHAR(2)  DEFAULT 'en'   -- 'en' | 'es' | 'pt'
is_active           BOOLEAN     DEFAULT TRUE
is_superuser        BOOLEAN     DEFAULT FALSE
web_push_subscription VARCHAR(2048)            -- JSON blob for browser push
created_at          TIMESTAMPTZ DEFAULT now()
updated_at          TIMESTAMPTZ DEFAULT now()
```

### `routes`

A route is the fundamental unit of monitoring. One route tracks one or more origin airports to one or more destination airports in one or more cabin classes over a date window.

```sql
id                      UUID        PRIMARY KEY
user_id                 UUID        FK → users.id  CASCADE DELETE
name                    VARCHAR(100) NOT NULL
origins                 VARCHAR(3)[] NOT NULL       -- e.g. ['MIA', 'MCO', 'FLL']
destinations            VARCHAR(3)[] NOT NULL       -- e.g. ['GRU', 'CNF']
cabin_classes           VARCHAR(20)[] NOT NULL      -- ['BUSINESS', 'FIRST', ...]
date_from               DATE        NOT NULL
date_to                 DATE        NOT NULL
trip_type               VARCHAR(10) DEFAULT 'ONE_WAY'  -- ONE_WAY | ROUND_TRIP | MONITOR
return_date_offset_days INTEGER                     -- days after departure (round-trips)
is_active               BOOLEAN     DEFAULT TRUE
max_drive_hours         FLOAT                       -- 0 = no driving; NULL = use default
priority_tier           VARCHAR(10) DEFAULT 'WARM'  -- HOT | WARM | COLD
created_at              TIMESTAMPTZ DEFAULT now()
updated_at              TIMESTAMPTZ DEFAULT now()
```

**MONITOR** trip type means "scan both directions independently and compare round-trip vs two one-ways."

### `alert_rules`

Per-route notification overrides. If absent for a route, system defaults from user settings apply.

```sql
id              UUID        PRIMARY KEY
user_id         UUID        FK → users.id
route_id        UUID        FK → routes.id  (nullable = global rule)
min_score       INTEGER     DEFAULT 60
notify_whatsapp BOOLEAN     DEFAULT TRUE
notify_push     BOOLEAN     DEFAULT TRUE
notify_error_fare BOOLEAN   DEFAULT TRUE
notify_award    BOOLEAN     DEFAULT TRUE
created_at      TIMESTAMPTZ DEFAULT now()
```

### `scan_history`

Audit log of every scan execution — what ran, how long, how many records were stored.

```sql
id              UUID        PRIMARY KEY
route_id        UUID        FK → routes.id
trigger_type    VARCHAR(20)               -- 'scheduled' | 'manual' | 'airflow'
status          VARCHAR(20)               -- 'success' | 'partial' | 'failed'
source          VARCHAR(20)               -- 'serpapi' | 'duffel' | 'seats_aero'
records_stored  INTEGER     DEFAULT 0
duration_ms     INTEGER
error_message   TEXT
created_at      TIMESTAMPTZ DEFAULT now()
```

### `cabin_quality`

Loaded from `backend/app/data/cabin_quality.json`. Maps airline + aircraft type to a curated product rating.

```sql
id              SERIAL      PRIMARY KEY
airline_code    VARCHAR(3)  NOT NULL
aircraft_type   VARCHAR(20)
product_name    VARCHAR(100)
quality_score   INTEGER               -- 1–100
seat_type       VARCHAR(20)           -- 'lie-flat' | 'angle-flat' | 'recliner'
has_door        BOOLEAN     DEFAULT FALSE
lie_flat        BOOLEAN     DEFAULT FALSE
bed_length_cm   INTEGER
seat_width_cm   INTEGER
configuration   VARCHAR(20)           -- e.g. '1-2-1'
```

Notable entries: Qatar Qsuite (98), ANA The Room (95), JAL Sky Suite III (96), Singapore Business (94), Cathay Aria Suite (95).

### `transfer_partners`

Loaded from `backend/app/data/transfer_partners.json`. Maps credit card rewards programs to airline loyalty programs.

```sql
id              SERIAL      PRIMARY KEY
card_program    VARCHAR(50)           -- 'Chase UR' | 'Amex MR' | 'Capital One' | ...
airline_program VARCHAR(50)           -- 'Aeroplan' | 'Smiles' | 'LifeMiles' | ...
transfer_ratio  FLOAT       DEFAULT 1.0  -- points per airline mile
transfer_time   VARCHAR(20)           -- 'instant' | '1-3 days' | ...
```

### `program_baselines`

Loaded from `backend/app/data/program_baselines.json`. Baseline Cents-Per-Point values used to evaluate award redemptions.

```sql
id              SERIAL      PRIMARY KEY
program_name    VARCHAR(50) UNIQUE NOT NULL
baseline_cpp    FLOAT       NOT NULL    -- typical CPP for this program (e.g. 1.5)
updated_at      TIMESTAMPTZ DEFAULT now()
```

---

## TimescaleDB Hypertables

All hypertables use a composite primary key of `(time, id)`. The `time` column is the TimescaleDB partitioning dimension. Indexed by `route_id` for fast per-route queries.

### `google_prices`

One row per SerpApi scan. Stores the overall cheapest price found plus Google's market intelligence signals.

```sql
time                TIMESTAMPTZ  PK (partition key)
id                  UUID         PK
route_id            UUID         NOT NULL  INDEX
origin              VARCHAR(3)   NOT NULL
destination         VARCHAR(3)   NOT NULL
departure_date      DATE         NOT NULL
cabin_class         VARCHAR(20)  NOT NULL
price_usd           FLOAT        NOT NULL
price_level         VARCHAR(20)            -- 'low' | 'typical' | 'high'
typical_price_low   FLOAT
typical_price_high  FLOAT
price_history       JSONB                  -- array of {date, price} from SerpApi
airline_codes       VARCHAR(3)[]
is_direct           BOOLEAN      DEFAULT FALSE
raw_response        JSONB                  -- full API response for debugging
```

### `flight_offers`

One row per offer per SerpApi scan, grouped by `(primary_airline, stops)` — cheapest within each group. Powers the "Flight Options" breakdown in the deal detail panel.

```sql
time                TIMESTAMPTZ  PK (partition key)
id                  UUID         PK
deal_analysis_id    UUID         INDEX   → deal_analysis.id
route_id            UUID         NOT NULL INDEX
origin              VARCHAR(3)   NOT NULL
destination         VARCHAR(3)   NOT NULL
departure_date      DATE         NOT NULL
cabin_class         VARCHAR(20)  NOT NULL
price_usd           FLOAT        NOT NULL
primary_airline     VARCHAR(3)
airline_codes       VARCHAR(3)[]
stops               INTEGER      DEFAULT 0
duration_minutes    INTEGER
is_direct           BOOLEAN      DEFAULT FALSE
```

### `duffel_prices`

Direct airline cash price from Duffel. Written daily at 7 AM (and on "Scan Now"). Contains the fare brand and conditions that SerpApi does not provide.

```sql
time                    TIMESTAMPTZ  PK (partition key)
id                      UUID         PK
route_id                UUID         NOT NULL INDEX
origin                  VARCHAR(3)   NOT NULL
destination             VARCHAR(3)   NOT NULL
departure_date          DATE         NOT NULL
cabin_class             VARCHAR(20)  NOT NULL
price_usd               FLOAT        NOT NULL
fare_brand_name         VARCHAR(100)          -- e.g. 'Business Lite'
fare_basis_code         VARCHAR(20)
expires_at              TIMESTAMPTZ
is_refundable           BOOLEAN
change_fee_usd          FLOAT
cancellation_penalty_usd FLOAT
baggage_included        BOOLEAN      DEFAULT FALSE
airline_codes           VARCHAR(3)[]
raw_response            JSONB
```

### `award_prices`

Award availability from Seats.aero. One row per loyalty program offering seats on this route+date combination.

```sql
time                TIMESTAMPTZ  PK (partition key)
id                  UUID         PK
route_id            UUID         NOT NULL INDEX
origin              VARCHAR(3)   NOT NULL
destination         VARCHAR(3)   NOT NULL
departure_date      DATE         NOT NULL
cabin_class         VARCHAR(20)  NOT NULL
loyalty_program     VARCHAR(50)  NOT NULL   -- e.g. 'Aeroplan', 'Smiles'
miles_cost          INTEGER      NOT NULL
cash_taxes_usd      FLOAT        DEFAULT 0.0
seats_available     INTEGER      DEFAULT 1
operating_airline   VARCHAR(3)
cpp_value           FLOAT                   -- calculated by award_analyzer
raw_response        JSONB
```

### `deal_analysis`

The output of the scoring engine. One row per scored deal snapshot. Contains the full score breakdown and the AI recommendation texts.

```sql
time                    TIMESTAMPTZ  PK (partition key)
id                      UUID         PK
route_id                UUID         NOT NULL INDEX
origin                  VARCHAR(3)   NOT NULL
destination             VARCHAR(3)   NOT NULL
departure_date          DATE         NOT NULL
cabin_class             VARCHAR(20)  NOT NULL
best_price_usd          FLOAT        NOT NULL
best_source             VARCHAR(20)  NOT NULL   -- 'google' | 'duffel' | 'award'
airline_code            VARCHAR(3)

-- Score breakdown (maps to scoring.py sub-functions)
score_total             FLOAT        DEFAULT 0
score_percentile        FLOAT        DEFAULT 0   -- 0–30 pts
score_zscore            FLOAT        DEFAULT 0   -- 0–20 pts
score_trend_alignment   FLOAT        DEFAULT 0   -- 0–15 pts
score_trend_direction   FLOAT        DEFAULT 0   -- 0–10 pts
score_cross_source      FLOAT        DEFAULT 0   -- 0–20 pts
score_arbitrage         FLOAT        DEFAULT 0   -- 0–10 pts
score_fare_brand        FLOAT        DEFAULT 0   -- 0–10 pts
score_scarcity          FLOAT        DEFAULT 0   -- 0–5 pts
score_award             FLOAT        DEFAULT 0   -- 0–50 pts

-- Action + flags
action                  VARCHAR(15)  DEFAULT 'NORMAL'  -- STRONG_BUY|BUY|WATCH|NORMAL|SKIP
is_gem                  BOOLEAN      DEFAULT FALSE
is_error_fare           BOOLEAN      DEFAULT FALSE
sources_confirmed       VARCHAR(20)[]

-- Context
percentile_position     FLOAT
zscore                  FLOAT
google_price_level      VARCHAR(20)
typical_price_low       FLOAT
typical_price_high      FLOAT
is_direct               BOOLEAN      DEFAULT FALSE
seats_remaining         INTEGER
fare_brand_name         VARCHAR(100)
best_award_miles        INTEGER
best_award_program      VARCHAR(50)
best_cpp                FLOAT

-- AI recommendations
ai_recommendation_en    TEXT
ai_recommendation_pt    TEXT

-- Alert tracking
alert_sent              BOOLEAN      DEFAULT FALSE
alert_sent_at           TIMESTAMPTZ
```

**Action thresholds:**

| Score | Action | Alerts Fire |
|-------|--------|------------|
| ≥ 6.0 (or GEM) | STRONG_BUY | All (WhatsApp + push) |
| ≥ 5.0 | BUY | Primary alerts |
| ≥ 4.0 | WATCH | Dashboard only |
| ≥ 2.5 | NORMAL | Logged only |
| < 2.5 | SKIP | Nothing |

---

## Continuous Aggregates

TimescaleDB continuous aggregates are materialized views that roll up raw `google_prices` data. Refreshed every 6 hours by the `stats_refresh_dag`.

### `google_price_hourly`

```sql
-- Hourly bucket of price statistics per route+cabin+airport pair
bucket      TIMESTAMPTZ   -- 1-hour bucket
route_id    UUID
origin      VARCHAR(3)
destination VARCHAR(3)
cabin_class VARCHAR(20)
min_price   FLOAT
avg_price   FLOAT
max_price   FLOAT
scan_count  INTEGER
```

### `price_daily_stats`

The primary input to the scoring engine. Used by `stats.py` to calculate percentiles and z-scores.

```sql
bucket      TIMESTAMPTZ   -- 1-day bucket
route_id    UUID
origin      VARCHAR(3)
destination VARCHAR(3)
cabin_class VARCHAR(20)
-- Percentile breakpoints
p5          FLOAT
p10         FLOAT
p20         FLOAT
p25         FLOAT
p30         FLOAT
p50         FLOAT         -- median
p75         FLOAT
p90         FLOAT
-- Distribution stats
avg_price   FLOAT
stddev_price FLOAT
min         FLOAT         -- all-time low (used for "historical low" chart line)
scan_count  INTEGER
```

---

## Missing: `route_events` Table

⚠️ The `route_events` table is specified in CLAUDE.md and powers the Zillow-style activity timeline on the Route Detail page. It has **not yet been created**. Migration `007_route_events.py` and the `generate_events` Airflow task are both missing.

See [ADR-0003](../decisions/0003-open-recommendations.md) for the full remediation plan.

Planned schema when implemented:

```sql
CREATE TABLE route_events (
    id              SERIAL       PRIMARY KEY,
    route_id        UUID         REFERENCES routes(id),
    timestamp       TIMESTAMPTZ  DEFAULT now(),
    event_type      VARCHAR(30)  NOT NULL,
    -- 'price_drop' | 'price_rise' | 'error_fare' | 'award_opened' | 'award_closed'
    -- 'airport_arbitrage' | 'trend_reversal' | 'new_low' | 'stable'
    -- 'monitoring_started' | 'fare_brand_detected' | 'scarcity_alert' | 'ai_insight'
    severity        VARCHAR(10)  DEFAULT 'info',
    -- 'critical' | 'high' | 'medium' | 'low' | 'info'
    headline        TEXT         NOT NULL,
    detail          TEXT,
    subtext         TEXT,
    airline         VARCHAR(50),
    price_usd       DECIMAL,
    previous_price_usd DECIMAL,
    deal_analysis_id INTEGER,
    metadata        JSONB
);
CREATE INDEX idx_route_events_route ON route_events(route_id, timestamp DESC);
```

---

## Dead Tables

These tables exist in the database schema but are **never written to**. They contain historical data from before July 2026.

| Table | Original Source | Decommissioned |
|-------|----------------|----------------|
| `amadeus_prices` | Amadeus self-service API | July 2026 |
| `kiwi_prices` | Kiwi Tequila API | Closed public registration |

---

## Alembic Migration History

| Version | Description |
|---------|-------------|
| `001_initial_schema` | All tables + TimescaleDB hypertables + continuous aggregates |
| `002_route_trip_type` | Added `trip_type` + `return_date_offset_days` to `routes` |
| `003_scan_history` | Added `scan_history` table |
| `004_deal_enrichment` | Added award columns to `deal_analysis` |
| `005_flight_offers` | Added `flight_offers` hypertable |
| `006_route_drive_hours` | Added `max_drive_hours` to `routes` |
| `007_route_events` | ⚠️ **Not yet created** |

---

## Related

- [System overview](overview.md) — how data flows between tiers
- [Data sources reference](../reference/data-sources.md) — what each source returns
- [ADR-0003](../decisions/0003-open-recommendations.md) — missing route_events remediation
