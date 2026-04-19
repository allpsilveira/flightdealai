Read the current CLAUDE.md and replace the entire "Data Sources (3 Active)" section — from the section header through the "API Rationalization" subsection — with everything below. Preserve all other sections of the file exactly as they are. Show me the diff before applying.

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
