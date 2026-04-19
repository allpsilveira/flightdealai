# ADR-0002: API Stack — SerpApi + Duffel + Seats.aero

Three data sources were selected for the active integration stack after evaluating eight alternatives. Each source fills a distinct role that no other evaluated option could cover at equivalent cost.

**Date:** 2026-04-19
**Status:** Accepted

---

## Context

FlyLuxuryDeals requires three distinct types of data:

1. **Market price scanning** — the cheapest current price for a route, refreshed frequently, with historical trend context.
2. **Direct airline pricing** — the bookable price direct from the airline, with fare conditions (fare brand, refundability, baggage, expiry).
3. **Award availability** — which loyalty programs have seats available and at what mile cost, to enable cash-vs-miles comparison.

These roles require different APIs. No single source covers all three adequately at viable cost.

---

## Decision

### Source 1: SerpApi (Google Flights) — Market Scanner

**Role:** Primary and only scheduled scan source.

**Why SerpApi:**
- Google Flights has the broadest airline coverage for trans-Atlantic and trans-Pacific routes, including code-share and interline itineraries.
- `price_insights` provides `price_level`, `typical_price_range`, and `price_history` — signals no other consumer-facing API returns.
- Individual offer breakdown (`best_flights` + `other_flights`) lets us populate a per-airline leaderboard without extra calls.
- Cost-predictable flat-rate plan ($25/mo for 1,000 searches).

**Key parameters used:**
```python
{"engine": "google_flights", "travel_class": "3",  # 3=Business
 "stops": "2", "currency": "USD", "type": "2"}     # type=2 is one-way
```

### Source 2: Duffel — Direct Airline Booking Price

**Role:** Daily enrichment — fare brand, conditions, refundability.

**Why Duffel:**
- Connects directly to airline NDC/GDS systems, returning the same fare a traveler would see booking at aa.com or latam.com.
- `fare_brand_name` (e.g. "Business Lite") is not available from Google Flights — this is the crucial signal for detecting downgraded business class products sold at Business prices.
- `expires_at` allows the UI to show an offer countdown timer.
- `conditions` object contains structured refund/change policies with penalty amounts rather than free-text.
- Pay-per-use pricing (~$0.005/search) keeps costs near zero at current volume.

### Source 3: Seats.aero — Award Availability

**Role:** Daily enrichment — miles cost, award scarcity, transfer partner mapping.

**Why Seats.aero:**
- Aggregates award availability across 24+ loyalty programs from a single API.
- The alternative (calling each program's API individually) would require 24+ API integrations, most of which have no public API at all.
- Flat $10/mo pricing is predictable and cost-effective for any number of daily searches within the 1,000 call/day limit.
- Returns `remaining_seats`, which directly feeds the scarcity sub-score.
- The `source` field maps to a loyalty program that we can then cross-reference with `transfer_partners.json` to show which credit card points are transferable.

---

## Alternatives Evaluated and Rejected

### FlightAPI.io ($49/mo)

Aggregates OTA prices (Google Flights, Kayak, etc.) but does **not** return `price_insights`, `typical_price_range`, or `price_level`. SerpApi returns identical pricing data plus trend intelligence for half the cost.

**Rejected:** inferior feature set at higher price.

### Amadeus Self-Service

Full GDS access with rich fare data. Was integrated in an earlier version of the project.

**Decommissioned July 2026:** The self-service developer tier was shut down. Enterprise API access requires contract negotiation and is priced beyond the scope of a personal project.

### Kiwi Tequila API

Aggregated OTA pricing with virtual interlining (combining tickets on different airlines for cheaper connections). Interesting for economy but less relevant for business class.

**Rejected:** Public API registration closed. No path to access.

### Aviation Edge ($299/mo)

Comprehensive airline data platform: schedules, routes, airports, aircraft.

**Rejected:** Contains no pricing data. Entirely the wrong product category.

### Aviationstack ($49.99/mo)

Real-time flight status, schedules, and IATA data.

**Rejected:** Contains no pricing data. Entirely the wrong product category.

### OAG ($249/mo)

Enterprise-grade airline scheduling and network data.

**Rejected:** Contains no pricing data. Entirely the wrong product category.

### Flightradar24

Real-time aircraft position tracking.

**Rejected:** Contains no pricing data. Entirely the wrong product category.

### RapidAPI Flight Collection

A marketplace aggregating multiple flight APIs.

**Rejected:** Aggregates the same data available directly from SerpApi and Duffel with additional latency and markup. No unique value.

---

## Cost Model

| Source | Plan | Monthly Cost | Call Budget |
|--------|------|-------------|------------|
| SerpApi | Starter | $25.00 | 1,000 searches |
| Duffel | Pay-per-use | ~$2.25 | ~450 searches (1 route × 15 combos/day) |
| Seats.aero | Pro | $10.00 | 1,000 calls/day |
| **Total** | | **~$37.25** | |

---

## Upgrade Paths

### When to add a 4th source

The three-source stack is sufficient for 1–5 actively monitored routes. Addition of a fourth source would be warranted if:
- SerpApi's 1,000 search/month budget is consistently exhausted (upgrade to $50/mo Growth plan first).
- A major route has poor SerpApi coverage (rare South American carriers not indexed by Google Flights).
- A client-side requirement needs real-time bookability verification beyond Duffel's ~30-minute offer expiry.

### Potential future additions (not currently planned)

- **Amadeus NDC** (if enterprise access becomes available): better coverage for LAN/TAM itineraries within South America.
- **AirGateway** or **Verteil**: newer NDC aggregators that may have better carrier coverage for Brazilian domestic connections.

---

## Related

- [Data sources reference](../reference/data-sources.md) — auth, rate limits, request shapes, quirks
- [Architecture overview](../architecture/overview.md#data-sources) — how sources fit into the pipeline
- [Glossary: GDS, NDC, Award Space](../reference/glossary.md)
