# ADR-0001: Dynamic Statistical Scoring Over Static Price Thresholds

The scoring engine uses percentile ranks and z-scores derived from each route's own rolling price history, rather than fixed dollar-amount thresholds, to evaluate deal quality.

**Date:** 2026-04-19
**Status:** Accepted

---

## Context

FlyLuxuryDeals monitors Business, First, and Premium Economy fares across corridors that have very different price distributions:

- A "cheap" Business fare MIA→GRU might be $2,800.
- A "cheap" Business fare MIA→CNF might be $1,600.
- A "cheap" Business fare on a thin route like MCO→GRU during off-peak might be $3,500.

If we set a static threshold like "flag anything under $3,000 as a deal", we would:
- Miss legitimate deals on thick/cheap routes (GRU is always under $3,000)
- Flood the user with false positives on expensive routes (MCO→GRU is rarely under $3,000 even at its floor)
- Fail entirely on new routes or cabin classes we have no institutional knowledge about

Additionally, what constitutes a "deal" for Business class changes seasonally, directionally (northbound vs. southbound traffic), and in response to competitive dynamics between LATAM, American, and United on South American routes.

---

## Decision

All scoring thresholds are derived from rolling statistics computed from each route's own TimescaleDB price history:

### Percentile Position (up to 1.76/10 normalized)

The price is evaluated against the 90-day distribution for the same (route, cabin, origin, destination) tuple. Breakpoints:

```
p5  → 30 raw points  (bottom 5% of observed prices)
p10 → 25
p20 → 20
p30 → 15
p40 → 10
p50 → 5  (median)
>p50 → 0
```

This means the same engine evaluates a $900 Premium Economy MIA→GRU deal and a $3,200 Business MIA→GRU deal with equal rigor — what matters is where each stands in its own distribution.

### Z-Score Signal (up to 1.18/10 normalized)

The z-score measures how many standard deviations below the mean a price falls. A z-score ≥ 2.5 is the error-fare detection signal — any price that anomalous is flagged for immediate review regardless of its final score.

```python
z = (mean_price − current_price) / stddev_price
```

### Google Trend Alignment (up to 0.88/10 normalized)

SerpApi returns `price_insights.price_level` ("low" / "typical" / "high") and `typical_price_range` from Google's own historical data. This external signal cross-validates our internal statistics and provides coverage during the cold-start period before we have 30 days of own data.

### Cold-Start Bootstrap

A new route starts with zero own data. During the first 30 days:

| Days | Strategy |
|------|----------|
| 0–3 | Data collection only. No scoring. Use SerpApi `typical_price_range` to calibrate expectations. |
| 4–14 | Conservative scoring using SerpApi trends with 25% weight from own data. |
| 15–30 | 50/50 blend of SerpApi trends and own TimescaleDB percentiles. |
| 30+ | Fully self-sufficient from own rolling statistics. |

This prevents false positives during the calibration window, at the cost of missing some deals in the first two weeks on a new route.

---

## Alternatives Considered

### Option A: Static Dollar Thresholds

Define fixed price breakpoints per route per cabin class — e.g. "Business MIA→GRU: flag below $2,800".

**Rejected because:**
- Requires manual maintenance as market prices shift.
- Breaks immediately when opening new routes without prior research.
- Cannot adapt to seasonal cycles (e.g. December fares are structurally higher).
- Different airlines price the same origin–destination differently based on their hub strategy.

### Option B: Percentage Below Published Fare

Compare the observed price to the airline's currently published "normal" fare — flag anything more than X% below.

**Rejected because:**
- Airlines do not publish a stable "normal" fare; it changes hourly.
- Promotional fares skew the baseline — a sale today makes tomorrow's regular price look like a deal.
- No API reliably returns the "normal" fare separate from the current offering.

### Option C: SerpApi Price Level Only

Use only Google's `price_level` ("low" / "typical" / "high") from SerpApi `price_insights`.

**Rejected because:**
- Google's classification is a single categorical signal with no underlying probability.
- It does not surface how *far* below typical a price is — "low" could be 5% or 45% below the midpoint.
- It is absent for thin routes with insufficient Google historical data.
- We cannot tune its sensitivity.

---

## Score Normalization

Raw sub-scores are intentionally expressed on their natural scales (percentile scoring 0–30, z-score 0–20, etc.) to preserve their relative weights during development. The final normalized score is:

```python
score_total = round(raw_total / 17.0, 1)   # 0.0–10.0
```

This normalization constant (17) equals the maximum possible raw score (170) divided by 10.

---

## Consequences

**Benefits:**
- Self-calibrating: no manual threshold maintenance.
- Equally rigorous across all routes, cabin classes, and price tiers.
- Naturally adapts to seasonal price cycles.
- Cold-start bootstrap means new routes are usable from day one.

**Drawbacks:**
- The first 30 days on a new route are more conservative — some real deals may be missed.
- If a route's prices decline structurally (e.g. new entrant on the route lowers fares permanently), the percentile distribution will adapt over 90 days, temporarily over-scoring what are now just "normal" post-competition prices.
- Anomaly detection (z-score ≥ 2.5) may generate false-positive error fare flags during data collection if early scans capture an unusual outlier that distorts the initial mean.

---

## Related

- [Architecture overview](../architecture/overview.md#cold-start-strategy) — cold-start phases
- [Data model](../architecture/data-model.md#deal_analysis) — score columns in `deal_analysis`
- [Glossary: Score](../reference/glossary.md#score) — sub-score weight table
- [ADR-0003](0003-open-recommendations.md) — implementation status of the scoring engine
