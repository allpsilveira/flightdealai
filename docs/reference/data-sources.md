# Data Sources Reference

> **Last reviewed:** April 19, 2026 — API docs verified against live documentation.
> **Next review:** July 2026 (quarterly cadence).

FlyLuxuryDeals integrates three active data sources. This document covers authentication, rate limits, request shape, response fields used, known quirks, and **unused capabilities** that could be adopted later.

---

## SerpApi (Google Flights) — Primary Scanner

SerpApi wraps the Google Flights UI and is the only *scheduled* scan source, providing market-level price intelligence that the other two sources do not.

**Cost:** $25/month (Starter — 1,000 searches/month)
**Documentation:** https://serpapi.com/google-flights-api

### Authentication

API key passed as a query parameter on every request.

```python
params = {"api_key": settings.serpapi_api_key, ...}
```

The key is stored in `.env` as `SERPAPI_API_KEY` and loaded via `app/config.py`.

### Rate Limits

- **Concurrency:** 3 parallel requests max (enforced via `asyncio.Semaphore(3)` in `serpapi_client.py`)
- **Retry policy:** Up to 3 attempts with exponential backoff (1 s → 2 s → 4 s) on HTTP 429
- **Monthly budget:** 1,000 searches/month. At 3 cabin classes × 4 h quick check + 3× full scan daily = ~270 searches/route/month. Budget supports approximately 3–4 active routes before needing a plan upgrade.

### Request Shape

```python
# Full trend scan (deep=True, 3× daily)
{
    "engine":         "google_flights",
    "api_key":        "<key>",
    "departure_id":   "MIA",          # IATA origin
    "arrival_id":     "GRU",          # IATA destination
    "outbound_date":  "2026-05-15",
    "type":           "2",            # 1=round-trip, 2=one-way
    "travel_class":   "3",            # 1=Economy, 2=Premium Economy, 3=Business, 4=First
    "stops":          "2",            # 0=nonstop, 1=1-stop, 2=any
    "currency":       "USD",
    "hl":             "en",
    "return_date":    "2026-05-22",   # only for type=1 (round-trip)
}
```

Cabin class codes: `1`=Economy, `2`=Premium Economy, `3`=Business, `4`=First.

### Response Fields Used

```python
# Overall best price (→ google_prices table)
best_flights[0]["price"]                          # best overall price
price_insights["price_level"]                     # 'low' | 'typical' | 'high'
price_insights["typical_price_range"]             # [low_usd, high_usd]
price_insights["price_history"]                   # list of {date, price}

# Individual offers (→ flight_offers table)
# Each item in best_flights + other_flights:
offer["price"]                                    # total price for this itinerary
offer["flights"][0]["airline_logo"]               # URL → extract IATA code
len(offer["flights"]) - 1                         # stop count
sum(f["duration"] for f in offer["flights"])      # total duration in minutes
```

IATA codes are not returned directly. They are extracted from the `airline_logo` URL:

```python
# e.g. "https://serpapi.com/.../AA.png" → "AA"
def _extract_iata(url: str) -> str | None:
    return url.rstrip("/").split("/")[-1].split(".")[0].upper() or None
```

### Known Quirks

- `price_insights` is returned only when Google has enough historical data for the route. On brand-new routes or very thin markets it may be absent. The client handles this with `None` fallbacks.
- `best_flights` may be empty while `other_flights` has results. The normalizer merges both arrays before grouping.
- For round-trip searches (`type=1`), the price includes both legs. The scoring engine treats this as the combined price — it does not split it.
- Google occasionally returns an `"error"` key with HTTP 200. The client checks for this and returns `None`.

### Unused SerpApi Capabilities (Future Opportunities)

These are available under the same $25/month plan but are not yet integrated:

| Capability | API/Field | Potential Use |
|-----------|-----------|---------------|
| **Booking Options** | `google_flights` with `booking_token` → booking_options[] | Direct booking links + baggage prices per airline. Could power a "Book Now" button with real URLs and POST data. |
| **Price Insights (standalone)** | `google_flights` → `price_insights` | Already partially used. The standalone `price_insights` endpoint returns `lowest_price`, `price_history` as `[timestamp, price]` pairs, and `typical_price_range`. We use these but could do more with timestamp-indexed history. |
| **Travel Explore** | `engine=google_travel_explore` | "Where should I fly?" discovery. Given an origin, returns destinations with `flight_price`, `hotel_price`, `number_of_stops`, `airline_code`, dates. Could power a "Discover Deals" feature for finding new routes. |
| **Flights Autocomplete** | `engine=google_flights_autocomplete` | Better airport search UX in the Add Route modal. Returns city/region/airport suggestions with IATA codes, distances. Supports `exclude_regions` for airport-only results. |
| **Carbon emissions** | `best_flights[].carbon_emissions` | CO₂ data per itinerary. Could display environmental impact per flight option. |
| **Often delayed flag** | `best_flights[].often_delayed` | Boolean flag from Google. Could warn users about delay-prone flights. |
| **Show hidden flights** | `show_hidden=true` param | Reveals "self-transfer" and separate-ticket itineraries Google normally hides. |
| **Multi-city** | `type=3` param | Multi-city itineraries for complex trips. |
| **Multiple airports** | Comma-separated `departure_id` | `departure_id=MIA,FLL,MCO` in a single query instead of separate calls per airport. Would reduce API call count significantly. |

---

## Duffel — Direct Airline Booking Price

Duffel connects directly to airline GDS systems and returns the same fare a traveler would see when booking on the airline's own website. Used exclusively as an enrichment source for fare brand details.

**Cost:** $0.005/search (~$2.25/month at current volume)
**Documentation:** https://duffel.com/docs
**SDK:** `duffel-api` Python package

### Authentication

Bearer token in the `Authorization` header.

```python
headers = {"Authorization": f"Bearer {settings.duffel_api_key}"}
```

The key is stored in `.env` as `DUFFEL_API_KEY`. Duffel provides a free test key (`duffel_test_...`) for development.

### Rate Limits

- 120 requests per 60 seconds (per API key)
- The client uses `asyncio.Semaphore(5)` for concurrency control
- Retries: 3 attempts with 2 s → 4 s → 8 s backoff on 429

### Request Shape

```python
duffel.offer_requests.create({
    "slices": [{
        "origin":           "MIA",
        "destination":      "GRU",
        "departure_date":   "2026-05-15",
    }],
    "passengers":   [{"type": "adult"}],
    "cabin_class":  "business",     # 'economy' | 'premium_economy' | 'business' | 'first'
    "max_connections": 1,           # 0=nonstop, 1=up to 1 connection
})
```

Note: Duffel cabin class values are lowercase strings, unlike SerpApi's numeric codes.

### Response Fields Used

```python
offer["total_amount"]                        # price in currency specified
offer["total_currency"]                      # always 'USD' if request currency is USD
offer["slices"][0]["fare_brand_name"]        # e.g. 'Business Lite'
offer["slices"][0]["fare_basis_code"]        # e.g. 'JFLEX'
offer["expires_at"]                          # ISO 8601 — offer validity window
offer["conditions"]["refund_before_departure"]["allowed"]       # bool
offer["conditions"]["change_before_departure"]["penalty_amount"] # USD or None
offer["slices"][0]["segments"][0]["operating_carrier"]["iata_code"]
```

### Known Quirks

- Offer prices **expire**. The `expires_at` field is typically 20–60 minutes after retrieval. The stored `DuffelPrice` row reflects the price at the time of retrieval, not a guaranteed bookable price.
- Not all airlines are available via Duffel. If the airline is not connected, the call returns an empty offers list (not an error). The client returns `None` in this case and the pipeline continues with only SerpApi data.
- The `fare_brand_name` field is crucial for detecting degraded products (e.g. "Business Lite" = no lounge/meal/miles). The scoring engine gives up to 10 bonus points when it detects a Lite/Basic brand priced >30% below the market average.
- Test key (`duffel_test_...`) returns mock data with plausible but fake prices. Switch to a live key before going to production.

### Unused Duffel Capabilities (Future Opportunities)

| Capability | Endpoint / Field | Potential Use |
|-----------|-----------------|---------------|
| **Available services** | `offer.available_services[]` | Seat selection and extra baggage add-ons with prices. Could show "seat upgrade $89" in ticket detail. |
| **Supported loyalty programmes** | `offer.supported_loyalty_programmes[]` | Which frequent flyer programs accept this booking. Could cross-reference with our transfer partner map. |
| **Total emissions (kg CO₂)** | `offer.total_emissions_kg` | Carbon footprint per itinerary. Could display alongside price. |
| **Payment requirements** | `offer.payment_requirements` | What payment types are accepted, deadlines. Useful for "book by" urgency. |
| **Order Cancellations** | `POST /air/order_cancellations` | Refund amount, refund method (cash/voucher/airline credit), expiry. Could support cancel/refund tracking if we ever integrate booking. |
| **Airline-Initiated Changes** | `GET /air/airline_initiated_changes` | Schedule changes after booking. Could power "your flight changed" alerts if we add booking. |
| **Seat Maps** | Duffel Seat Maps API | Visual seat selection data (seat type, pitch, recline, price). Could enhance cabin quality display. |
| **List offers sorting** | `sort=total_amount` or `sort=total_duration` | Currently we just pick cheapest. Could also track fastest option. |
| **Partial offers** | `offer.partial` flag | Some offers are only partially available (e.g. one segment). We currently filter these out. |

---

## Seats.aero — Award Availability

Seats.aero aggregates award seat availability across 24+ loyalty programs in real time. This is the source for all miles-based pricing and CPP calculations.

**Cost:** $10/month flat (Pro subscription)
**Documentation:** https://seats.aero/apidocs
**Auth header:** `Partner-Authorization`

### Authentication

A custom header (not the standard `Authorization` header):

```python
headers = {"Partner-Authorization": settings.seats_aero_api_key}
```

The key is stored in `.env` as `SEATS_AERO_API_KEY` and begins with `pro_`.

### Rate Limits

- 1,000 API calls per day (Pro plan)
- No per-second rate limit documented; the client uses `asyncio.Semaphore(5)`
- At 1 route × 3 cabin classes × 1 daily enrichment = 3 calls/day. Budget supports approximately 330 routes before needing a plan upgrade.

### Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /api/availability` | Cached availability search by route |
| `GET /api/trips` | Get full trip details for a specific availability |

```python
# Cached availability search
GET https://seats.aero/api/availability
  ?origin_airport=MIA
  &destination_airport=GRU
  &cabin=business              # 'economy' | 'premium_economy' | 'business' | 'first'
  &start_date=2026-05-01
  &end_date=2026-05-31
```

### Response Fields Used

```python
result["source"]                     # loyalty program name (e.g. 'aeroplan', 'smiles')
result["mileage_cost"]               # miles required
result["taxes_and_fees_usd"]         # cash co-pay in USD
result["remaining_seats"]            # seats available (1–9+)
result["route"]["origin_airport"]    # IATA
result["route"]["destination_airport"] # IATA
result["operating_carrier"]          # operating airline IATA
```

### CPP Calculation

Cents-Per-Point is calculated by the `award_analyzer.py` service after retrieval:

```python
# Cash equivalent value of the award
cash_value = best_cash_price - cash_taxes_usd

# CPP = cents per mile/point spent
cpp = (cash_value / miles_cost) * 100   # e.g. 3.5 cents/mile

# Ratio vs program baseline (from program_baselines.json)
cpp_vs_baseline = cpp / baseline_cpp    # e.g. 2.3× the typical value
```

The scoring engine awards up to 20 bonus points for a `cpp_vs_baseline` ≥ 5×.

### Known Quirks

- Availability caches refresh every 4–6 hours. Do not expect real-time accuracy on specific flights.
- The `remaining_seats` count is often capped at 9 by loyalty programs. A value of 9 means "9 or more", not exactly 9.
- Some programs (e.g. Avianca LifeMiles) report availability but disable access via transfer partners intermittently. The transfer partner map in `transfer_partners.json` should be audited against current program terms when significant CPP values appear.
- The `source` field uses lowercase program code names that must be mapped to display names. The `award_analyzer.py` service handles this mapping.

### Unused Seats.aero Capabilities (Future Opportunities)

| Capability | Endpoint | Potential Use |
|-----------|----------|---------------|
| **Bulk Availability** | `GET /api/availability/bulk` | Fetch availability for multiple routes in a single call. Would reduce API calls for multi-route users. |
| **Alerts** | `POST /api/alerts` | Native server-side alerts when award seats open. Could offload some of our polling to Seats.aero's infrastructure. |
| **Programs list** | `GET /api/programs` | List all supported loyalty programs with metadata. Could auto-populate program baselines instead of our static JSON. |
| **Cached routes** | `GET /api/cached-routes` | List all routes Seats.aero actively caches. Help users know which routes have award availability tracking. |

---

## Cabin Class Mappings Across Sources

Different sources use different codes for the same cabin. The backend normalizes everything to the internal format on ingest.

| Internal | SerpApi (`travel_class`) | Duffel (`cabin_class`) | Seats.aero (`cabin`) |
|----------|--------------------------|------------------------|----------------------|
| `ECONOMY` | `"1"` | `"economy"` | `"economy"` |
| `PREMIUM_ECONOMY` | `"2"` | `"premium_economy"` | `"premium_economy"` |
| `BUSINESS` | `"3"` | `"business"` | `"business"` |
| `FIRST` | `"4"` | `"first"` | `"first"` |

---

## Evaluated and Rejected Sources

The following sources were evaluated in April 2026 and rejected. They should not be integrated.

| Source | Cost | Reason Rejected |
|--------|------|----------------|
| Aviation Edge | $299/mo | Flight tracking/schedules only — no pricing data |
| Aviationstack | $49.99/mo | Flight status only — no pricing data |
| OAG | $249/mo | Enterprise airline schedules only — no pricing data |
| Flightradar24 | — | Real-time aircraft positions only — no pricing data |
| FlightAPI.io | $49/mo | Returns OTA prices but without `price_insights`/trend data; SerpApi does this better for $25/mo |
| RapidAPI Flight Collection | — | Marketplace aggregator — no unique value over current stack |
| Amadeus self-service | — | Decommissioned July 2026 |
| Kiwi Tequila | — | Closed public registration |

---

## Related

- [Architecture overview](../architecture/overview.md) — how sources fit into the pipeline
- [ADR-0002: API stack decision](../decisions/0002-api-stack.md) — the full evaluation rationale

---

## Other SerpApi Travel APIs (Not Yet Integrated)

These are additional SerpApi engines available under the same $25/month plan. They share the monthly search quota.

### Google Hotels API (`engine=google_hotels`)

Search hotels by destination, dates, and guest count. Returns properties with prices, ratings, reviews breakdown, amenities, and nearby places.

**Potential use:** Bundle hotel suggestions when a flight deal is found. "Business class to GRU for $1,800 — hotels from $120/night." Could add a "Hotel Deals" section to the Route Detail page.

**Key params:** `q` (destination), `check_in_date`, `check_out_date`, `adults`, `sort_by` (3=lowest price, 8=highest rating), `hotel_class`, `min_price`, `max_price`.

**Key response data:** `properties[].rate_per_night`, `properties[].overall_rating`, `properties[].hotel_class`, `properties[].amenities[]`, `properties[].deal` (e.g. "26% less than usual").

### Google Travel Explore API (`engine=google_travel_explore`)

"Where should I fly?" destination discovery from a given origin.

**Potential use:** A "Discover Routes" feature that suggests new destinations based on current cheap fares. "From MIA, business class to Lisbon is only $1,400 right now."

**Key params:** `departure_id` (IATA or kgmid), `arrival_id` (optional), `outbound_date`, `return_date`, `type` (1=round trip, 2=one way), `stops`, `include_airlines`, `interest` (outdoors/beaches/museum/history/skiing).

**Key response data:** `destinations[].flight_price`, `destinations[].destination_airport`, `destinations[].airline_code`, `destinations[].number_of_stops`, `destinations[].start_date`, `destinations[].end_date`.

### Google Flights Autocomplete API (`engine=google_flights_autocomplete`)

Airport and city autocomplete for search inputs.

**Potential use:** Replace the static `airports.json` in the Add Route modal with live autocomplete. Returns cities with all nearby airports and distances.

**Key params:** `q` (search query), `gl`, `hl`, `exclude_regions` (true = airports/cities only).

**Key response data:** `suggestions[].name`, `suggestions[].type` (city/region), `suggestions[].airports[].id` (IATA), `suggestions[].airports[].distance`.

---

## Third-Party APIs Considered for Future Integration

| API | Cost | What It Offers | Status |
|-----|------|---------------|--------|
| **ExchangeRate-API** | Free tier (1,500/mo) | Live USD→BRL/EUR/GBP rates | Could show prices in local currency. Low priority — can use a static rate. |
| **AeroDataBox** (RapidAPI) | $10/mo | Aircraft type per flight, seat configs | Could enrich cabin quality with real aircraft data instead of static JSON. |
| **Sherpa (travel restrictions)** | Free tier | Visa/COVID/entry requirements by nationality | "Do I need a visa?" context on deal cards. Useful for BR↔US corridor. |
| **Loungebuddy** | No public API | Airport lounge access by card/program | Would be great but no API available. Manual data only. |

---

## Documentation Review Schedule

This document should be reviewed **quarterly** to catch API changes, new endpoints, deprecations, and pricing updates.

| Review Date | Reviewer | Changes Made |
|------------|----------|--------------|
| Apr 19, 2026 | Claude + Gabriel | Initial comprehensive review. Added unused capabilities sections, new SerpApi APIs, third-party suggestions. Verified all three APIs against live docs. |

**How to review:**
1. Visit each API's docs page (links in each section header)
2. Compare documented request/response shapes against our client code
3. Check for new endpoints, deprecations, or pricing changes
4. Update the "Unused Capabilities" tables if we adopt any features
5. Update the "Last reviewed" date at the top of this file
- [Glossary](glossary.md) — CPP, GEM, fare brand, and other terms
