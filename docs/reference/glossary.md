# Glossary

Domain terms, abbreviations, airport codes, and system jargon used throughout FlyLuxuryDeals.

---

## Flight Industry Terms

### Award Space
Seats that an airline makes available for redemption with loyalty program miles, as opposed to cash tickets. Award space is allocated separately from paid inventory and can open or close at any time.

### Award Ticket
A flight booking paid with loyalty program miles (+ cash co-pay for taxes). See also: **CPP**, **Redemption**.

### Cabin Class
The tier of service on a flight. FlyLuxuryDeals monitors three:

| Code | Full Name | Example Products |
|------|-----------|-----------------|
| `BUSINESS` | Business Class | Qatar Qsuite, United Polaris, American Flagship |
| `FIRST` | First Class | Emirates First Suite, Lufthansa First, Singapore Suites |
| `PREMIUM_ECONOMY` | Premium Economy | Ana Premium Economy, Cathay Premium Economy |

### CPP (Cents Per Point / Cents Per Mile)
How much monetary value you extract from each mile or point spent on an award redemption.

```
CPP = (cash_equivalent_value − cash_taxes) / miles_cost × 100
```

**Example:** A $3,500 Business class ticket redeemed for 70,000 miles + $150 in taxes:
```
CPP = ($3,500 − $150) / 70,000 × 100 = 4.79 cents/mile
```

FlyLuxuryDeals compares the CPP of each award against the program's **baseline CPP** (stored in `program_baselines.json`) to score its relative value.

### Error Fare
A published price significantly below the airline's intended fare, caused by a system glitch, currency conversion error, or data entry mistake. These are typically valid for booking for only a few hours before correction. In FlyLuxuryDeals, a deal is flagged as a possible error fare when its z-score is ≥ 2.5 (more than 2.5 standard deviations below the route's mean).

### Fare Basis Code
An alphanumeric code (e.g. `JFLEX`, `YBIZ`) that uniquely identifies the exact fare rules — refundability, change fees, mileage earning, advance purchase requirements. Returned by Duffel.

### Fare Brand / Branded Fare
A named tier within a cabin class (e.g. "Business Lite", "Business Flex"). Airlines increasingly sell multiple sub-products within Business class — "Lite" versions typically exclude lounge access, meals, or mileage earning. FlyLuxuryDeals detects Lite/Basic brands via Duffel's `fare_brand_name` field and adjusts the score accordingly.

### GDS (Global Distribution System)
Middleman infrastructure that connects travel agencies and booking platforms to airline inventory systems. Examples: Amadeus GDS, Sabre, Travelport. Duffel connects directly to airline GDS to retrieve live pricing.

### GEM Deal
A price anomaly detected by the cross-reference engine that is so low it cannot be explained by statistics alone — e.g. a Business fare below the historical 5th percentile with only a single data point. GEM deals always trigger alerts regardless of their numeric score.

### IATA Code
The 2-letter airline code or 3-letter airport code issued by the International Air Transport Association.

- Airlines: `AA` (American), `LA` (LATAM), `UA` (United), `QR` (Qatar), `NH` (ANA)
- Airports: see **Airport Codes** section below

### Lie-Flat Seat
A Business or First class seat that reclines to a fully flat position for sleeping. Considered the minimum acceptable for overnight trans-oceanic routes. The cabin quality database records whether each product is lie-flat.

### Mixed Cabin
An itinerary where different legs operate in different cabin classes — e.g. connecting flight in Economy, long-haul segment in Business. FlyLuxuryDeals does not explicitly track mixed-cabin itineraries; all SerpApi results are filtered by the requested `travel_class`.

### Open-Jaw
A flight itinerary where the destination of the outbound leg differs from the origin of the return leg — or vice versa. Example: fly MIA→GRU, return from CNF→MIA.

### Positioning Flight
A short domestic or regional flight flown in Economy to connect to a long-haul Business/First departure at a different airport. Example: flying Spirit MIA→MCO to connect to a TAM Business class MCO→GRU. The "Airport Arbitrage" score component rewards routes where positioning flights offer significant savings.

### Redemption
The act of booking an award ticket using loyalty program miles or points.

### Transfer Partner
A credit card rewards program (e.g. Chase Ultimate Rewards, Amex Membership Rewards) that allows its points to be converted into airline miles at a published ratio. FlyLuxuryDeals maps these relationships in `transfer_partners.json`.

---

## Airport Codes

### Primary Origin Airports (South Florida / Central Florida)

| IATA | Airport | City |
|------|---------|------|
| MIA | Miami International Airport | Miami, FL |
| MCO | Orlando International Airport | Orlando, FL |
| FLL | Fort Lauderdale–Hollywood International Airport | Fort Lauderdale, FL |

These three airports are the default origin cluster for Gabriel's primary corridor. The Airport Arbitrage score component compares prices across all three to find positioning-flight savings.

### Primary Destination Airports (Brazil)

| IATA | Airport | City |
|------|---------|------|
| GRU | Guarulhos International Airport (São Paulo/Guarulhos) | São Paulo, Brazil |
| CNF | Tancredo Neves International Airport (Confins) | Belo Horizonte, Brazil |
| GIG | Tom Jobim International Airport (Galeão) | Rio de Janeiro, Brazil |
| BSB | Brasília International Airport | Brasília, Brazil |

---

## Loyalty Programs

Common programs tracked via Seats.aero, with their typical baseline CPP and primary transfer partners.

| Program | Airline | Typical CPP | Transfer Sources |
|---------|---------|-------------|-----------------|
| Aeroplan | Air Canada | 1.5¢ | Chase UR, Amex MR, Capital One |
| AAdvantage | American Airlines | 1.5¢ | Citi ThankYou |
| MileagePlus | United Airlines | 1.4¢ | Chase UR |
| LifeMiles | Avianca | 1.3¢ | Capital One, Amex MR |
| Smiles | GOL / LATAM | 1.2¢ | Amex MR |
| Flying Blue | Air France / KLM | 1.4¢ | Amex MR, Chase UR, Capital One |
| Executive Club | British Airways | 1.5¢ | Amex MR, Chase UR, Capital One |
| Asia Miles | Cathay Pacific | 1.4¢ | Amex MR |
| KrisFlyer | Singapore Airlines | 1.5¢ | Amex MR |
| Qmiles | Qatar Airways | 1.4¢ | Amex MR |

---

## System Terms

### Action
The recommendation label assigned to a deal after scoring. One of:

| Action | Score | Meaning |
|--------|-------|---------|
| STRONG_BUY | ≥ 6.0 | Exceptional deal — all alerts fire |
| BUY | ≥ 5.0 | Good deal — primary alerts fire |
| WATCH | ≥ 4.0 | Below-average price — dashboard only |
| NORMAL | ≥ 2.5 | Typical market price — logged only |
| SKIP | < 2.5 | At or above market — no action |

GEM deals always produce STRONG_BUY regardless of numeric score.

### Cold Start
The 30-day period after a new route is added, during which the scoring engine does not yet have enough own historical data for reliable statistics. During this window, SerpApi's `price_insights.typical_price_range` is used as a proxy. See [architecture/overview.md](../architecture/overview.md#cold-start-strategy).

### Continuous Aggregate
A TimescaleDB feature that pre-materializes aggregated queries (e.g. daily percentile statistics) into a separate table and updates it incrementally. FlyLuxuryDeals uses two: `google_price_hourly` and `price_daily_stats`. Refreshed every 6 hours by the `stats_refresh_dag`.

### DAG (Directed Acyclic Graph)
An Apache Airflow workflow definition. Each DAG is a set of tasks with defined execution order and dependencies. FlyLuxuryDeals generates one DAG per active `(route, cabin_class)` pair at runtime.

### Force Enrich
A flag in `deal_pipeline.py` that determines whether the Duffel and Seats.aero enrichment sources are called.
- `force_enrich=False` → SerpApi quick scan only (4 h cycle)
- `force_enrich=True` → daily 7 AM enrichment or "Scan Now" — all three sources fire

### HOT / WARM / COLD (Priority Tiers)
The scan frequency tier assigned to each route by the `update_priority` Airflow task.

| Tier | Interval | Assigned When |
|------|----------|--------------|
| HOT | Every 2 h | Route produced a BUY or GEM action recently |
| WARM | Every 4 h | Default tier for active routes |
| COLD | Every 8 h | No significant activity in recent scans |

### Hypertable
A TimescaleDB table partitioned by time. Enables efficient time-range queries and compression of historical data. All price and scoring data (5 tables) are hypertables.

### Price Level
A signal from Google Flights (via SerpApi) classifying the current price as `"low"`, `"typical"`, or `"high"` relative to Google's own historical data for the route. Used as one input to the trend alignment sub-score.

### Score
The numeric deal quality rating produced by the scoring engine, on a **0.0–10.0 scale**. Computed by normalizing the raw sub-score total (max 170) by dividing by 17.

Sub-score weights:

| Component | Max Raw | Max Normalized |
|-----------|---------|---------------|
| Percentile position | 30 | 1.76 |
| Z-score signal | 20 | 1.18 |
| Google trend alignment | 15 | 0.88 |
| Trend direction | 10 | 0.59 |
| Cross-source validation | 20 | 1.18 |
| Airport arbitrage | 10 | 0.59 |
| Fare brand value | 10 | 0.59 |
| Scarcity | 5 | 0.29 |
| Award bonus | 50 | 2.94 |
| **Total** | **170** | **10.0** |

### XCom
Apache Airflow's cross-communication mechanism — a key-value store that allows tasks in the same DAG run to share data. FlyLuxuryDeals uses XCom to pass `score_total`, `deal_id`, `action`, and `is_gem` between tasks. Payloads are kept small (IDs and scalars, not full API responses).

### Z-Score
A statistical measure of how many standard deviations below (or above) the route's mean price a given price falls. A positive z-score in FlyLuxuryDeals means the price is *below* the mean (good for the traveler).

```
z = (mean_price − current_price) / stddev_price
```

A z-score ≥ 2.5 triggers the error fare flag.

---

## Related

- [Architecture overview](../architecture/overview.md) — system flow
- [Data model](../architecture/data-model.md) — table schemas
- [Data sources](data-sources.md) — API integrations
- [ADR-0001: Dynamic scoring](../decisions/0001-dynamic-scoring.md) — scoring design rationale
