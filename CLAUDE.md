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

## Data Sources — Complete Implementation Guide

> **Active stack:** SerpApi (Google Flights) + Duffel + Seats.aero
> **Dead sources (do not write to):** Amadeus (`amadeus_prices`), Kiwi (`kiwi_prices`) — tables kept for historical data only.
> **Rejected sources (do not integrate):** Aviation Edge, Aviationstack, OAG, Flightradar24, FlightAPI.io, RapidAPI collection — evaluated April 2026, none provide pricing intelligence. See rationale at end of this section.

---

### SOURCE 1: SerpApi (Google Flights) — PRIMARY SCANNER

**Role:** Only scheduled scan source. Runs every 4h (quick check) and 3x/day (full scan with trends). Parses all individual offers per airline+stops to populate `flight_offers` table. Only source of Google's price trend intelligence (`price_level`, `typical_price_range`, `price_history`).

**Auth:** `api_key` query parameter
**Cost:** $25/month (Starter plan — 1,000 searches/month)
**Endpoint:** `https://serpapi.com/search?engine=google_flights`
**Playground:** `https://serpapi.com/playground?engine=google_flights`
**Python SDK:** `serpapi` package (`from serpapi import GoogleSearch`)

#### Request Parameters — Complete Reference

**Required:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `engine` | string | Must be `google_flights` |
| `api_key` | string | Your SerpApi key |
| `departure_id` | string | IATA code (`MIA`) or kgmid (`/m/0vzm`). Multiple comma-separated: `MIA,MCO,FLL` |
| `arrival_id` | string | Same format. Multiple: `GRU,CNF` |
| `outbound_date` | string | `YYYY-MM-DD` format |

**Trip type:**
| Parameter | Type | Values |
|-----------|------|--------|
| `type` | string | `1` = Round trip (default), `2` = One way, `3` = Multi-city |
| `return_date` | string | Required if `type=1`. `YYYY-MM-DD` |
| `multi_city_json` | string | Required if `type=3`. JSON array of `{departure_id, arrival_id, date}` |

**Cabin & passengers:**
| Parameter | Values |
|-----------|--------|
| `travel_class` | `1`=Economy, `2`=Premium Economy, `3`=Business, `4`=First |
| `adults` | Default `1` |
| `children` | Default `0` |
| `infants_in_seat` | Default `0` |
| `infants_on_lap` | Default `0` |

**Filters:**
| Parameter | Description |
|-----------|-------------|
| `stops` | `0`=Nonstop, `1`=1 stop or fewer, `2`=2 stops or fewer |
| `include_airlines` | Comma-separated IATA codes (e.g., `LA,AD,AA`). Cannot combine with `exclude_airlines` |
| `exclude_airlines` | Comma-separated IATA codes to exclude |
| `bags` | Number of checked bags (affects price) |
| `max_price` | Max ticket price in selected currency |
| `outbound_times` | `depStart,depEnd` or `depStart,depEnd,arrStart,arrEnd`. E.g., `4,18` = 4AM-7PM departure |
| `return_times` | Same format, round trips only |
| `emissions` | `1` = Less emissions only |
| `layover_duration` | `min,max` in minutes. E.g., `90,330` |
| `exclude_conns` | Airport codes to exclude as connections |
| `max_duration` | Max flight duration in minutes |

**Display & sorting:**
| Parameter | Description |
|-----------|-------------|
| `hl` | Language: `en`, `pt`, `es` |
| `gl` | Country: `us`, `br` |
| `currency` | ISO code: `USD`, `BRL`, `EUR` |
| `sort_by` | `1`=Top, `2`=Price, `3`=Departure, `4`=Arrival, `5`=Duration, `6`=Emissions |
| `show_hidden` | `true` = include "View more flights" results |
| `deep_search` | `true` = browser-identical results (slower, more complete) |

**Token-based flows:**
| Parameter | Description |
|-----------|-------------|
| `departure_token` | From outbound result. Used in second request to get return flights for round trips. Each outbound has a unique token. |
| `booking_token` | From one-way result or after selecting both legs. Returns `booking_options` with airline/OTA URLs and prices. |

#### Response Structure

**`best_flights[]` and `other_flights[]`:**
```json
{
  "flights": [
    {
      "departure_airport": {"name": "Miami International Airport", "id": "MIA", "time": "2026-06-17 08:30"},
      "arrival_airport": {"name": "São Paulo/Guarulhos", "id": "GRU", "time": "2026-06-17 20:15"},
      "duration": 600,
      "airplane": "Boeing 787",
      "airline": "LATAM",
      "airline_logo": "https://www.gstatic.com/flights/airline_logos/70px/LA.png",
      "travel_class": "Business",
      "flight_number": "LA 531",
      "ticket_also_sold_by": ["American", "Delta"],
      "legroom": "72 in",
      "extensions": ["Lie-flat seat", "Wi-Fi", "In-seat power & USB outlets", "Carbon emissions estimate: 807 kg"]
    }
  ],
  "layovers": [{"duration": 120, "name": "Santiago Airport", "id": "SCL", "overnight": false}],
  "total_duration": 720,
  "carbon_emissions": {"this_flight": 808000, "typical_for_this_route": 615000, "difference_percent": 31},
  "price": 1890,
  "type": "One way",
  "airline_logo": "https://www.gstatic.com/flights/airline_logos/70px/LA.png",
  "departure_token": "WyJDalJJ...",
  "booking_token": "WyJDalJJ..."
}
```

**`price_insights` — CRITICAL for scoring engine:**
```json
{
  "lowest_price": 1890,
  "price_level": "low",
  "typical_price_range": [2400, 3200],
  "price_history": [
    [1691013600, 2575],
    [1691100000, 2450],
    [1696197600, 1890]
  ]
}
```
- `price_level`: Google's assessment — `"low"`, `"typical"`, `"high"`. Powers scoring dimension 3.
- `typical_price_range`: `[low_bound, high_bound]` — cold-start reference for percentile calculation.
- `price_history`: `[unix_timestamp, price]` pairs spanning weeks — bootstraps trend analysis before we have our own 30-day data.

**`booking_options[]` — returned when `booking_token` is provided:**
```json
{
  "book_with": "American",
  "airline": true,
  "airline_logos": ["https://...AA.png"],
  "marketed_as": ["AA 8566"],
  "fare_type": "BUSINESS",
  "price": 1890,
  "option_title": "Business",
  "extensions": ["Seat selection included", "2 free checked bags"],
  "baggage_prices": ["2 free checked bags", "1 free carry-on"],
  "booking_request": {"url": "https://www.google.com/travel/clk/f", "post_data": "..."}
}
```
- `booking_request.url` + `post_data` = direct booking redirect (POST to Google → airline/OTA site)
- `fare_type`: "BASIC ECONOMY", "ECONOMY", "PREMIUM ECONOMY", "BUSINESS", "FIRST"

#### Google Travel Explore API (same key, same credit pool)
**Engine:** `google_travel_explore`
**Use:** "Where can I fly cheapest from MIA?" — destination discovery.
**Response:** Destinations with prices, dates, airlines, stop counts.
**Future feature:** "Explore deals" mode on the app.

#### IATA extraction from airline_logo:
```python
def extract_iata(airline_logo_url: str) -> str:
    return airline_logo_url.split("/")[-1].replace(".png", "")
```

#### Round-trip vs one-way monitoring:
1. `type=2` one-way outbound → prices + offers
2. `type=2` one-way return (swap origin/dest) → prices + offers
3. `type=1` round trip + `return_date` → round-trip price (requires 2 calls: outbound + return via `departure_token`)
4. Compare: `one_way_out + one_way_return` vs `round_trip` → show cheaper option
5. **Optimization:** Round-trip comparison 1x/day only. One-way scans at normal frequency.

#### Budget math:
- 1,000 searches/month at $25
- 1 route, one-way, 6 scans/day: ~180/month (18%)
- 1 route, "monitor both", 6 scans/day: ~360/month (36%)
- 3 routes, "monitor both", 6 scans/day: ~1,080/month — OVER BUDGET
- **Fix:** Round-trip comparison 1x/day per route. One-way 6x/day. → 3 routes = ~720/month (72%)

#### What we store per scan:
1. `google_prices` hypertable: one row with cheapest overall price + `price_level` + `typical_range_low/high`
2. `google_prices.metadata` JSONB: full `price_history` array for cold-start
3. `flight_offers` table: one row per unique (airline, stops) combo — cheapest per group
4. Per offer: price, airline IATA, stops, total_duration, airplane, legroom, carbon_emissions, flight_number, departure/arrival times

---

### SOURCE 2: Duffel — DIRECT AIRLINE PRICING + FARE BRANDS

**Role:** Airline-direct GDS pricing with fare brand names, refund/change conditions, offer expiry, and ancillary detail. The only source of "Business Lite" vs "Business Flex" fare identification. Runs once daily at 7 AM + on "Scan Now".

**Auth:** Bearer token in `Authorization` header
**Python SDK:** `duffel-api` (`from duffel import Duffel`)
**Cost:** $0.005/search (~$2.25/month for 1 route × 15 combos/day)
**Rate limit:** 120 requests per 60 seconds
**Base URL:** `https://api.duffel.com`
**Docs:** `https://duffel.com/docs/api`
**Test mode:** Free sandbox available with `duffel_test_` prefixed keys

#### Creating an Offer Request

```python
from duffel import Duffel

client = Duffel(access_token="duffel_live_xxxxx")

offer_request = client.offer_requests.create({
    "slices": [{
        "origin": "MIA",
        "destination": "GRU",
        "departure_date": "2026-06-17"
    }],
    "passengers": [{"type": "adult"}],
    "cabin_class": "business",
    "max_connections": 1,
    "return_offers": True
})

for offer in offer_request.offers:
    print(offer.total_amount, offer.total_currency)
```

**`cabin_class` values:** `"economy"`, `"premium_economy"`, `"business"`, `"first"`
**`max_connections`:** `0` = nonstop only, `1` = 1 stop max (recommended), `2` = 2 stops max
**`return_offers`:** `True` returns offers inline (simpler). `False` returns request ID for later polling.
**`supplier_timeout`:** Max wait time in ms for airline response (2000-60000). Default varies.

#### Offer Response Structure

```json
{
  "id": "off_00009htYpSCXrwaB9DnUm0",
  "total_amount": "1890.00",
  "total_currency": "USD",
  "base_amount": "1650.00",
  "base_currency": "USD",
  "tax_amount": "240.00",
  "tax_currency": "USD",
  "expires_at": "2026-04-12T15:30:00Z",
  "payment_requirements": {
    "requires_instant_payment": false,
    "price_guarantee_expires_at": "2026-04-12T15:30:00Z"
  },
  "owner": {
    "name": "LATAM Airlines",
    "iata_code": "LA",
    "logo_symbol_url": "https://assets.duffel.com/img/airlines/..."
  },
  "slices": [{
    "origin": {"iata_code": "MIA", "name": "Miami International Airport"},
    "destination": {"iata_code": "GRU", "name": "São Paulo/Guarulhos"},
    "duration": "PT10H0M",
    "fare_brand_name": "Business Lite",
    "segments": [{
      "origin": {"iata_code": "MIA"},
      "destination": {"iata_code": "GRU"},
      "departure_datetime": "2026-06-17T08:30:00",
      "arrival_datetime": "2026-06-17T20:15:00",
      "operating_carrier": {"name": "LATAM Airlines", "iata_code": "LA"},
      "marketing_carrier": {"name": "LATAM Airlines", "iata_code": "LA"},
      "operating_carrier_flight_number": "531",
      "aircraft": {"name": "Boeing 787-9", "iata_code": "789"},
      "duration": "PT10H0M",
      "passengers": [{
        "cabin_class": "business",
        "cabin_class_marketing_name": "Premium Business",
        "fare_basis_code": "DNNBR",
        "baggages": [
          {"type": "checked", "quantity": 2},
          {"type": "carry_on", "quantity": 1}
        ]
      }]
    }]
  }],
  "conditions": {
    "refund_before_departure": {
      "allowed": true,
      "penalty_amount": "200.00",
      "penalty_currency": "USD"
    },
    "change_before_departure": {
      "allowed": true,
      "penalty_amount": "150.00",
      "penalty_currency": "USD"
    }
  },
  "available_services": []
}
```

#### Key Fields We Extract

| Field | Path | What it powers |
|-------|------|---------------|
| Total price | `offer.total_amount` | Direct airline price comparison vs SerpApi |
| Currency | `offer.total_currency` | Always normalize to USD |
| Fare brand | `slice.fare_brand_name` | "Business Lite" detection → scoring dimension 7 |
| Fare basis code | `segment.passengers[0].fare_basis_code` | Fare tier identification |
| Aircraft | `segment.aircraft.name` | Cabin quality lookup → `cabin_quality.json` |
| Operating carrier | `segment.operating_carrier.iata_code` | Actual airline operating the flight |
| Marketing carrier | `segment.marketing_carrier.iata_code` | Codeshare detection (when different from operating) |
| Offer expiry | `offer.expires_at` | ExpiryCountdown component in ticket detail |
| Refund allowed | `offer.conditions.refund_before_departure.allowed` | Fare conditions display |
| Refund penalty | `offer.conditions.refund_before_departure.penalty_amount` | Fare conditions display |
| Change allowed | `offer.conditions.change_before_departure.allowed` | Fare conditions display |
| Change penalty | `offer.conditions.change_before_departure.penalty_amount` | Fare conditions display |
| Baggage included | `segment.passengers[0].baggages` | Included bags display |
| Duration | `slice.duration` | ISO 8601 duration (e.g., "PT10H0M") — parse to minutes |
| Cabin marketing name | `segment.passengers[0].cabin_class_marketing_name` | "Premium Business" vs "Business" |

#### Batch Offer Requests (for high-volume scanning)
For multiple date/cabin combinations, use batch requests to avoid blocking:
```python
batch = client.batch_offer_requests.create({
    "slices": [{"origin": "MIA", "destination": "GRU", "departure_date": "2026-06-17"}],
    "passengers": [{"type": "adult"}],
    "cabin_class": "business",
    "max_connections": 1
})
# Poll: GET /air/batch_offer_requests/{id} until remaining_batches == 0
```

#### Test Scenarios (Duffel sandbox)
- Timeout test: Search `STN` → `LHR` (guaranteed timeout)
- No baggage test: Search `BTS` → `MRU`
- No services test: Search `BTS` → `ABV`
- Normal test: Any major route (MIA→GRU works in sandbox with synthetic data)

#### What we store per scan:
`duffel_prices` hypertable — one row per offer with: price_usd, airline, operating_carrier, fare_brand_name, fare_basis_code, cabin_class, stops, duration_minutes, departure_date, aircraft, refundable (boolean), changeable (boolean), change_penalty_usd, offer_expires_at, baggage_included (text)

#### Budget math:
- $0.005 per search, no monthly minimum
- 1 route × 3 cabin classes × 5 dates = 15 calls/day = $0.075/day = ~$2.25/month
- 3 routes: ~$6.75/month
- On-demand "Scan Now": ~$0.05 per click (10 combos)

---

### SOURCE 3: Seats.aero — AWARD AVAILABILITY

**Role:** Award/miles availability across 24 loyalty programs. Shown alongside cash prices for cash-vs-miles comparison. Calculates cents-per-point (CPP) value. Runs once daily at 7 AM + on "Scan Now".

**Auth:** `Partner-Authorization: pro_xxxxx` header
**Cost:** $10/month flat (Pro subscription)
**Rate limit:** 1,000 API calls per calendar day (resets midnight UTC)
**Rate tracking:** `X-RateLimit-Remaining` response header
**Base URL:** `https://seats.aero/partnerapi`
**Docs:** `https://developers.seats.aero/reference`
**Commercial use:** NOT permitted without written approval. Current usage is personal/non-commercial.

#### Supported Programs (24 sources)
`aeroplan`, `alaska`, `american`, `aeromexico`, `azul`, `copa`, `delta`, `emirates`, `ethiopian`, `etihad`, `finnair`, `flyingblue`, `gol`, `jetblue`, `lufthansa`, `qantas`, `qatar`, `sas`, `saudia`, `singapore`, `turkish`, `united`, `virginatlantic`, `virginaustralia`

**Most relevant to MIA→GRU:** `azul`, `gol`, `american`, `copa`, `delta`, `united`, `aeroplan`, `flyingblue`

#### Endpoint 1: Cached Search (PRIMARY)
Search specific origin→destination across all programs.

```
GET /partnerapi/search
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `origin` | string | IATA code. Multiple: `MIA,MCO,FLL` |
| `destination` | string | IATA code. Multiple: `GRU,CNF` |
| `cabin` | string | `economy`, `premiumeconomy`, `business`, `first`. Multiple: `business,first` |
| `start_date` | string | `YYYY-MM-DD` |
| `end_date` | string | `YYYY-MM-DD` |
| `source` | string | Optional. Filter to one program (e.g., `aeroplan`). Omit = all programs. |

```python
import httpx

response = httpx.get(
    "https://seats.aero/partnerapi/search",
    params={
        "origin": "MIA,MCO,FLL",
        "destination": "GRU,CNF",
        "cabin": "business,first",
        "start_date": "2026-06-01",
        "end_date": "2026-06-30"
    },
    headers={"Partner-Authorization": f"pro_{api_key}"}
)
data = response.json()["data"]
```

**Response — Availability objects:**
```json
{
  "data": [{
    "ID": "avail_xxxxx",
    "RouteID": "route_xxxxx",
    "Route": {
      "OriginAirport": "MIA",
      "OriginRegion": "North America",
      "DestinationAirport": "GRU",
      "DestinationRegion": "South America"
    },
    "Source": "aeroplan",
    "Date": "2026-06-17",
    "YMileageCost": 35000,
    "WMileageCost": 50000,
    "JMileageCost": 70000,
    "FMileageCost": 120000,
    "YRemainingSeats": 5,
    "WRemainingSeats": 3,
    "JRemainingSeats": 2,
    "FRemainingSeats": 1,
    "YDirects": 1,
    "WDirects": 0,
    "JDirects": 1,
    "FDirects": 0,
    "YAvailable": true,
    "WAvailable": true,
    "JAvailable": true,
    "FAvailable": true,
    "CreatedAt": "2026-04-10T08:00:00Z",
    "UpdatedAt": "2026-04-10T14:30:00Z"
  }]
}
```

**Cabin prefix key:** Y=economy, W=premium economy, J=business, F=first
- `{X}MileageCost`: Points required
- `{X}RemainingSeats`: Award seats available
- `{X}Directs`: Nonstop options count
- `{X}Available`: Boolean — any space exists
- `Source`: Mileage program name
- `UpdatedAt`: Freshness (cached data — verify on airline site before transferring points)

#### Endpoint 2: Get Trips
Flight-level detail for a specific availability.

```
GET /partnerapi/trips/{availability_id}
```

```json
{
  "data": [{
    "ID": "trip_xxxxx",
    "AvailabilityID": "avail_xxxxx",
    "AvailabilitySegments": [{
      "Origin": "MIA",
      "Destination": "GRU",
      "Carrier": "LA",
      "FlightNumber": "LA531",
      "DepartureTime": "2026-06-17T08:30:00",
      "ArrivalTime": "2026-06-17T20:15:00",
      "Cabin": "J",
      "Aircraft": "787"
    }],
    "TotalDuration": 600,
    "Stops": 0,
    "Carriers": "LA",
    "RemainingSeats": 2,
    "MileageCost": 70000,
    "TotalTaxes": 8500,
    "TaxesCurrency": "USD",
    "TaxesCurrencySymbol": "$",
    "FlightNumbers": "LA531",
    "DepartsAt": "2026-06-17T08:30:00Z",
    "ArrivesAt": "2026-06-17T20:15:00Z",
    "Cabin": "J",
    "Source": "aeroplan"
  }],
  "booking_links": [{"source": "aeroplan", "url": "https://www.aeroplan.com/..."}],
  "origin_coordinates": {"lat": 25.7959, "lng": -80.2870},
  "destination_coordinates": {"lat": -23.4356, "lng": -46.4731}
}
```

**Key:** `TotalTaxes` is in CENTS (8500 = $85.00). Always divide by 100.

#### Endpoint 3: Bulk Availability
Broad search for one program across regions.

```
GET /partnerapi/availability?source=gol&origin_region=North America&destination_region=South America&cabin=business
```

Returns same Availability objects. Use for discovery, not route monitoring.

#### Endpoint 4: Get Routes
Which routes a program monitors.

```
GET /partnerapi/routes?source=aeroplan
```

Returns `OriginAirport`, `DestinationAirport`, `NumDaysOut`, `Distance`.

#### CPP Calculation Logic:
```python
def calculate_cpp(cash_price_usd: float, miles_cost: int, taxes_cents: int) -> float:
    """Cents per point. Higher = better redemption value."""
    if miles_cost <= 0:
        return 0.0
    taxes_usd = taxes_cents / 100
    cash_value = cash_price_usd - taxes_usd
    return round((cash_value / miles_cost) * 100, 2)

def calculate_multiplier(cpp: float, program: str, baselines: dict) -> float:
    """How many times better than typical. 5.4x = exceptional."""
    baseline = baselines.get(program, {}).get("typical_cpp", 1.5)
    return round(cpp / baseline, 1)
```

#### Award Event Generation:
- `award_opened`: `JAvailable`/`FAvailable` flipped false→true, OR `MileageCost` dropped >10%
- `award_closed`: `JAvailable`/`FAvailable` flipped true→false
- `award_sweet_spot`: CPP multiplier ≥3x baseline
- `scarcity_alert`: `RemainingSeats` dropped to 1-2

#### What we store per scan:
`award_prices` hypertable — one row per program per date: loyalty_program, miles_cost, cash_taxes_usd (converted from cents), cabin, seats_available, operating_airline, stops, direct (boolean), cpp_value (calculated), transfer_partners (array from static JSON)

#### Budget math:
- 1,000 calls/day, $10/month flat
- Cached Search: 1 call per origin-dest-cabin combo
- Get Trips: 1 call per interesting availability (top 3-5)
- 1 route, business+first: ~6-10 calls/scan
- 1 scan/day + occasional Scan Now: ~15-20 calls/day (2% of budget)

---

### Enrichment Layer: Cabin Quality Database (static JSON)
File: `backend/app/data/cabin_quality.json`
Maps: airline IATA + aircraft type → product name, quality score (1-100), seat type, has_door, lie_flat, bed_length_inches, seat_width_inches, direct_aisle_access, configuration.
Referenced when: Deal cards display cabin context. Aircraft type comes from Duffel `segment.aircraft` or SerpApi `airplane` field.

### Enrichment Layer: Transfer Partner Database (static JSON)
File: `backend/app/data/transfer_partners.json`
Maps: credit card program → airline loyalty programs with transfer ratios.
Referenced when: Seats.aero returns award availability → show user how to transfer points.

### Enrichment Layer: Program Baselines (static JSON)
File: `backend/app/data/program_baselines.json`
Maps: program name → typical CPP value (e.g., Smiles = 1.3¢, Aeroplan = 1.7¢).
Referenced when: Calculating CPP multiplier for award scoring.

---

### API Rationalization — Evaluated and Rejected Sources

The following APIs were evaluated in April 2026 and rejected. **Do not integrate any of them:**

| API | Cost | Why rejected |
|-----|------|-------------|
| Aviation Edge | $299/mo after trial | Flight tracking/schedules only. Zero pricing data. |
| Aviationstack | $49.99/mo | Flight tracking/status only. Zero pricing data. |
| OAG | $249/mo (500 calls) | Airline schedules. Zero pricing data. Enterprise-grade overkill. |
| Flightradar24 | Credit-based | Real-time aircraft positions. Zero pricing data. |
| FlightAPI.io | $49/mo | Returns OTA prices but WITHOUT price_insights/trends. SerpApi already does this better for $25/mo. |
| RapidAPI Flight Collection | Varies | Marketplace aggregator. No unique value over current stack. |

**None of these provide fare pricing intelligence, trend data, fare brand identification, or award availability.** The current 3-source stack covers all pricing needs with zero gaps at $37/month total.

---

## Scanning Strategy (Cost-Optimized)

**NOT brute-force. Tiered by frequency and cost.**

```
TIER 1 — SCHEDULED PRICE SCAN (SerpApi, $25/mo flat):
  Every 4h  → quick price check only (SerpApi, no enrichment)
  3x/day    → full scan: price + price_level + price_history + typical_range
              Also parses all offers → populates flight_offers table

TIER 2 — DAILY ENRICHMENT (fires once at 7 AM for all active routes):
  Duffel     → direct airline cash price, fare brand, conditions (~$2.25/mo at 1 route)
  Seats.aero → award availability + CPP calculation ($10/mo flat)
  NOTE: NOT score-gated. Runs for every route+cabin+date combo once per day.

TIER 3 — ON-DEMAND ("Scan Now" button):
  All three sources fire immediately: SerpApi + Duffel + Seats.aero
  Always enriches regardless of score.

TOTAL: ~$37/month all-in (SerpApi $25 + Seats.aero $10 + Duffel ~$2.25)
```

**Enrichment trigger logic (deal_pipeline.py):**
- `force_enrich=False` → SerpApi 4h quick scan, no Duffel/Seats.aero call
- `force_enrich=True`  → Daily 7 AM enrichment OR "Scan Now" — always enriches
- Score-based gating (`ENRICH_THRESHOLD`) is removed. Score quality improves independently as historical data accumulates.

---

## Dynamic Scoring Engine (ALL thresholds derived from data)

**No hardcoded price thresholds. Everything is percentile/z-score based.**

### Cash Score (0–87 raw points, normalized to 0–5.1 on the 0–10 scale):
1. **Percentile Position (0-30):** Where does price fall in 90-day distribution? Bottom 5%=30, 10%=25, 20%=20, 30%=15, 40%=10, median=5, above=0
2. **Z-Score Signal (0-20):** How many std devs below mean? ≥2.5=20 (anomaly/error fare), ≥2.0=16, ≥1.5=12, ≥1.0=8, ≥0.5=4
3. **Google Trend Alignment (0-15):** Price vs typical_price_range midpoint. Also +3 bonus if price_level="low", -3 if "high"
4. **Trend Direction (0-10):** 7-day slope. Falling fast=10, dropping=7, stable=3, rising=0, spiking=-5
5. **Cross-Source Validation (0-20):** How many sources confirm low price? 4=20, 3=16, 2=12, 1(GEM)=15, disagree=5
6. **Airport Arbitrage (0-10):** Savings % between best and worst airport. >30%=10, >20%=7, >10%=5
7. **Fare Brand Value (0-10):** Business Lite detected at >30% below standard = 10
8. **Scarcity (0-5):** 1 seat=5, ≤3=4, ≤5=2, ≤10=1

### Award Score (0–50 raw bonus, normalized to 0–2.9 on the 0–10 scale, when available):
1. **CPP Value (0-20):** cash_price / miles_cost vs baseline CPP per program. ≥5x=20, ≥3x=15, ≥2x=10
2. **Award Scarcity (0-15):** 1 seat=15, 2=10, ≤4=5
3. **Program Accessibility (0-15):** Transferable from 3+ card programs=15, 2=12, 1=8

**Normalization:** raw_total (max 170) / 17 = `score_total` on 0.0–10.0 scale.

### Cold Start (first 30 days):
- Days 0-3: Use SerpApi typical_price_range only, no scoring, data collection mode
- Days 4-14: Blend SerpApi trends + emerging own data, conservative scoring
- Days 15-30: 50/50 blend
- Days 30+: Self-sufficient from own TimescaleDB percentiles

### Actions:
- 6.0+ → STRONG_BUY (all alerts fire)
- 5.0–5.9 → BUY (primary alerts)
- 4.0–4.9 → WATCH (dashboard only)
- 2.5–3.9 → NORMAL (log)
- <2.5 → SKIP
- GEM flag → always alert regardless of score
- z-score >2.5 → flag as POSSIBLE ERROR FARE → always alert

**GEM definition (canonical):**
`is_gem = True` when Duffel returned a fare **and** Google Flights had **no result** for the same route/cabin scan. This means the airline published the fare directly through GDS but it was not surfaced by Google's aggregation — exclusive intel not visible to the public through normal search.
`is_gem` is never triggered by price alone. Price-based discount signal is separate: `discount_pct` = percentage below the midpoint of Google's `typical_price_range` (positive = cheaper than typical). Consumers of this field decide their own threshold — it is never hardcoded in the engine.

### ML Augmentation (Phase 4 — best-effort)
The hand-rolled scorer above is **always** the source of truth for `score_total`. ML adds richer
signals on top, surfaced through `/deals/{id}/explain` and the ScoreExplainer UI:

- **Forecaster** — statsforecast AutoARIMA per (route, cabin), 14-day horizon → "buy now vs wait"
- **Anomaly** — IsolationForest per (route, cabin) on price/dow/days_out/month → confirms error fares
- **Expected price** — global LightGBM regressor + SHAP top-3 → "X% below trained expectation"

Models live in `ml_models/` (joblib), retrained weekly Sun 03:00 UTC by `dags/ml_retrain_dag.py`.
All loaders return None gracefully when artifacts are missing — system runs identically without them.
ML signals never block scoring; they only enrich the explainer drivers.

---

## Apache Airflow DAG Architecture

### Main DAG (per route, per cabin class — dynamically generated):
```
fetch_serpapi ──→ cross_reference ──→ score_deal ──→ generate_events ──→ branch_score
                                                                               │
                                                               ┌───────────────┴──────────┐
                                                             ≥50                          <50
                                                               │                           │
                                                          ai_analysis                 log_skip
                                                               │
                                                         branch_action
                                                               │
                                               ┌───────────────┴──────────────┐
                                           BUY/GEM                         WATCH/NORMAL
                                               │                               │
                                         enrich_duffel                  update_dashboard
                                               │
                                         enrich_awards (Seats.aero)
                                               │
                                         dispatch_alerts (WhatsApp + Web Push)
                                               │
                                         update_priority          ◄── (all paths converge)
```

**Key Airflow features used:**
- BranchPythonOperator (score ≥3.0 → AI; action BUY/GEM → enrich)
- XCom (pass data between tasks — google_result, xref_summary, score_total, deal_id)
- trigger_rule=NONE_FAILED_MIN_ONE_SUCCESS (graceful degradation)
- retries=3 with exponential backoff per task
- SLA monitoring (5 min per cycle)
- Dynamic DAG generation from DB — one DAG per active (route × cabin_class)
- HOT=every 2h, WARM=every 4h, COLD=every 8h schedules

### Secondary DAGs:
- **weekly_briefing:** Monday 7 AM — Claude AI market summary via WhatsApp
- **stats_refresh:** Every 6h — manually refreshes TimescaleDB continuous aggregates
- **cabin_quality_refresh:** Monthly — Claude reviews cabin DB for updates
- **cheapest_date_scan:** Daily 6 AM — SerpApi samples next 60 days to find cheapest departure dates

---

## Database Schema

### PostgreSQL + TimescaleDB

**Regular tables:** users, routes (with origins[], destinations[], cabin_classes[]), alert_rules, cabin_quality, transfer_partners, program_baselines

**Hypertables (time-series):** google_prices (SerpApi best price per scan), flight_offers (all offers per airline+stops per scan), duffel_prices, award_prices (Seats.aero), deal_analysis

**Dead tables (do not write to):** amadeus_prices, kiwi_prices — kept for historical data only

**Continuous aggregates:** google_price_hourly, price_daily_stats (with percentiles p5/p10/p20/p25/p30/median/p75/p90, stddev, min)

**flight_offers table:** Stores every individual offer from SerpApi per scan, grouped by (primary_airline, stops) — cheapest per group. Linked to deal_analysis via `deal_analysis_id` FK. Used to power the "Flight Options" breakdown in the deal detail modal.

### Route Events Table (powers Zillow-style activity timeline)
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

The `generate_events` task writes to this table after every scan. Only significant events are created — collapse "no change" scans into max 1 "stable" event per day.

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
**Developer Tools:** Links to Swagger UI (`/docs`), Airflow UI, Grafana, GitHub repo. Visible only to superusers.

Route-specific alert overrides live on Route Detail, not here.

### Design Direction: Luxury Travel Concierge
- **Aesthetic:** Minimal, elegant, refined. Think Amex Platinum app meets Centurion Lounge.
- **Color palette:** Deep navy/charcoal backgrounds, warm gold/champagne accents, crisp white text. No bright colors except for deal score badges.
- **Typography:** Elegant serif for headings (e.g., Playfair Display, Cormorant Garamond), clean sans-serif for data (e.g., DM Sans, Outfit).
- **Motion:** Subtle, smooth transitions. No flashy animations. Content fades in gracefully.
- **Cards:** Frosted glass effect or subtle elevation. Generous whitespace. Never cluttered.
- **Maps:** Elegant dark-themed map with gold/champagne pins for airports, price labels overlaid.

### Price History Chart — SteamDB as Reference Model
Gabriel specifically cited **SteamDB** (https://steamdb.info/) as the ideal reference for how price history should be visualized on route charts. Key patterns to emulate:
- **Historical low marker** — a persistent dotted/dashed line showing the all-time lowest price on record (sourced from `price_daily_stats.min`). Always visible even when zoomed to 30d.
- **Event annotations on the chart** — vertical markers where significant events occurred (price_drop, new_low, award_opened). Same events as the activity timeline, projected onto the chart timeline axis.
- **Price floor/ceiling patterns** — Business fares on a given route often repeat cycles (e.g., drops to $2,800 every 6-8 weeks). 180d+ view makes this pattern visible and actionable.
- **Big sale spikes** — the most valuable signal: when a price drops far below the established floor, it stands out dramatically on the historical chart. This is the "error fare" detection equivalent.
- The chart is the primary intelligence surface — not just a graph, but a tool for reading timing patterns and knowing when to wait vs. buy now.

### Pages/Tabs that do NOT exist:
- No Airport Comparison page (embedded in Level 3 Ticket Detail)
- No Alert Settings page (merged into Settings; route overrides on Route Detail)
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
- SerpApi client (Google Flights with price_insights + all-offers parsing)
- Duffel client (fare brand detail)
- Seats.aero client (award check)
- Data normalization + storage to hypertables
- CLI test command for manual scan

### Phase 3: Intelligence Engine (Days 9-13)
- Rolling statistics calculator (TimescaleDB percentiles + z-scores)
- Cold-start bootstrap (SerpApi typical_range seed)
- Cross-reference engine (gem detection, match type classification)
- Dynamic scoring engine (120 cash + 50 award points)
- Event generator (route_events table, 14 event types)
- Award CPP calculator + transfer partner mapping
- Airport comparison logic
- Fare brand detection
- Cabin quality enrichment
- Claude AI advisor integration

### Phase 4: Airflow Orchestration (Days 14-17)
- DAG factory (dynamic DAG per route from DB)
- All task modules (fetch, xref, score, generate_events, branch, ai, alert, priority)
- Parallel execution + branching logic
- XCom data flow
- Retry + SLA configuration
- Secondary DAGs (weekly briefing, stats refresh, cheapest date, cabin refresh)
- Airflow connection store for all API keys

### Phase 5: Web Application (Days 18-25)
- Home page (route cards, urgency sort, WebSocket live updates)
- Route Creation Modal (5-step flow)
- Route Detail page (price chart + cheapest-date strip + activity timeline + airline leaderboard)
- Ticket Detail panel (slide-in, fare + airport comparison + award comparison)
- Settings page (account + notifications + display + developer tools)
- Global Header with language switcher (EN/ES/PT)
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
AIRFLOW_FERNET_KEY=        # python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
AIRFLOW_SECRET_KEY=        # openssl rand -hex 32

# Data sources (sign up required — see .env.example for details)
SERPAPI_API_KEY=           # serpapi.com — $25/mo
DUFFEL_API_KEY=            # duffel.com — free test key available
SEATS_AERO_API_KEY=        # seats.aero — $10/mo
ANTHROPIC_API_KEY=         # console.anthropic.com — pay-per-use

# Twilio WhatsApp
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# Web Push (VAPID)
VAPID_PUBLIC_KEY=          # generate with py-vapid
VAPID_PRIVATE_KEY=
VAPID_CLAIM_EMAIL=

# App
JWT_SECRET=                # openssl rand -hex 64
APP_DOMAIN=                # e.g. flightdeal.yourdomain.com
```

---

## Key Rules for Claude Code

1. **Keep the existing design skeleton.** Deep navy/charcoal + gold/champagne + serif headings. Do NOT change colors, fonts, or visual identity. Improve animations, transitions, shadows, and spacing — but keep the same look.
2. **Never hardcode price thresholds.** All scoring is percentile/z-score based.
3. **Backend is async throughout.** Use `async def` for all FastAPI routes and service methods.
4. **Airflow tasks must be idempotent.** Re-running a task should not create duplicate data.
5. **All API clients must handle failures gracefully.** Return None on failure, log the error, let the pipeline continue with partial data.
6. **Use XCom for passing data between Airflow tasks.** Keep payloads small (IDs and scores, not full API responses).
7. **Store raw API responses in a separate table** for debugging, but work with normalized data in the main hypertables.
8. **Trilingual support: EN/ES/PT.** Use i18n — do not hardcode English strings in components. All user-facing text (including AI recommendations) respects the user's language preference.
9. **Cost-conscious scanning:** Duffel and Seats.aero run once daily at 7 AM + on "Scan Now". SerpApi is the only scheduled scanner.
10. **Docker-first:** Everything runs in Docker. No local Python installs needed on the server.
11. **Route-centric architecture.** No standalone feature pages. Everything accessed through a route.
12. **Airport comparison is NEVER a separate page.** Embedded in Level 3 Ticket Detail panel.
13. **Alert settings are NEVER a separate page.** Merged into Settings. Route overrides on Route Detail.
14. **Every scan cycle generates events.** Write to route_events for significant changes. Max 1 "stable" event per day for no-change scans.
15. **Grafana is internal only.** Users never see it. All user-facing charts use Recharts.
16. **Never overwrite changes from other sessions.** Always read the current state of a file before editing. If a file has changed since your last read, re-read it first. Do not assume prior generated content is still present.
