"""
Dynamic scoring engine — Phase 3 full implementation.
Stub here returns a placeholder score from available data.
All thresholds are percentile/z-score based — NEVER hardcoded price values.
"""
import structlog
from typing import Any

logger = structlog.get_logger(__name__)


def score_deal(
    xref:           dict[str, Any],
    google_result:  dict[str, Any] | None,
    daily_stats:    dict[str, Any] | None,   # from price_daily_stats view
    duffel_result:  dict[str, Any] | None,
    award_results:  list[dict] | None,
) -> dict[str, Any]:
    """
    Computes the full deal score (0–170 points) from cross-reference + stats.

    Returns the score breakdown dict that maps 1:1 to DealAnalysis columns.
    Phase 3 will fill in all sub-scores; Phase 1 stub computes what it can.
    """
    best_price = xref.get("best_price_usd")
    if not best_price:
        return _empty_score()

    score_percentile    = _score_percentile(best_price, daily_stats)
    score_zscore        = _score_zscore(best_price, daily_stats)
    score_trend_align   = _score_trend_alignment(best_price, google_result)
    score_trend_dir     = 0.0   # Phase 3 — requires 7-day slope from TimescaleDB
    score_cross_source  = _score_cross_source(xref)
    score_arbitrage     = 0.0   # Phase 3 — requires multi-airport comparison
    score_fare_brand    = _score_fare_brand(best_price, duffel_result, daily_stats)
    score_scarcity      = _score_scarcity(xref.get("seats_remaining"))
    score_award         = _score_award(best_price, award_results)

    total = (score_percentile + score_zscore + score_trend_align + score_trend_dir
             + score_cross_source + score_arbitrage + score_fare_brand
             + score_scarcity + score_award)

    # z-score raw value for error-fare detection
    zscore_raw = _zscore_raw(best_price, daily_stats)
    is_error_fare = zscore_raw is not None and zscore_raw >= 2.5

    action = _action(total, xref.get("is_gem", False))

    return {
        "score_total":          total,
        "score_percentile":     score_percentile,
        "score_zscore":         score_zscore,
        "score_trend_alignment": score_trend_align,
        "score_trend_direction": score_trend_dir,
        "score_cross_source":   score_cross_source,
        "score_arbitrage":      score_arbitrage,
        "score_fare_brand":     score_fare_brand,
        "score_scarcity":       score_scarcity,
        "score_award":          score_award,
        "action":               action,
        "is_gem":               xref.get("is_gem", False),
        "is_error_fare":        is_error_fare,
        "percentile_position":  _percentile_position(best_price, daily_stats),
        "zscore":               zscore_raw,
        "google_price_level":   google_result.get("price_level") if google_result else None,
        "seats_remaining":      xref.get("seats_remaining"),
        "fare_brand_name":      duffel_result.get("fare_brand_name") if duffel_result else None,
    }


# ── Sub-score helpers ──────────────────────────────────────────────────────────

def _score_percentile(price: float, stats: dict | None) -> float:
    """0–30 points based on position in 90-day distribution."""
    pos = _percentile_position(price, stats)
    if pos is None:
        return 0.0
    if pos <= 5:   return 30.0
    if pos <= 10:  return 25.0
    if pos <= 20:  return 20.0
    if pos <= 30:  return 15.0
    if pos <= 40:  return 10.0
    if pos <= 50:  return  5.0
    return 0.0


def _percentile_position(price: float, stats: dict | None) -> float | None:
    """Approximate percentile by interpolating against p5–p90 breakpoints."""
    if not stats:
        return None
    breakpoints = [
        (stats.get("p5"),  5),
        (stats.get("p10"), 10),
        (stats.get("p20"), 20),
        (stats.get("p25"), 25),
        (stats.get("p30"), 30),
        (stats.get("p50"), 50),
        (stats.get("p75"), 75),
        (stats.get("p90"), 90),
    ]
    breakpoints = [(v, p) for v, p in breakpoints if v is not None]
    if not breakpoints:
        return None
    for val, pct in breakpoints:
        if price <= val:
            return float(pct)
    return 100.0


def _zscore_raw(price: float, stats: dict | None) -> float | None:
    if not stats:
        return None
    avg    = stats.get("avg_price")
    stddev = stats.get("stddev_price")
    if avg and stddev and stddev > 0:
        return (avg - price) / stddev  # positive = below mean (good)
    return None


def _score_zscore(price: float, stats: dict | None) -> float:
    """0–20 points based on z-score below mean."""
    z = _zscore_raw(price, stats)
    if z is None:
        return 0.0
    if z >= 2.5: return 20.0
    if z >= 2.0: return 16.0
    if z >= 1.5: return 12.0
    if z >= 1.0: return  8.0
    if z >= 0.5: return  4.0
    return 0.0


def _score_trend_alignment(price: float, google: dict | None) -> float:
    """0–15 points: price vs Google typical range midpoint."""
    if not google:
        return 0.0
    low  = google.get("typical_price_low")
    high = google.get("typical_price_high")
    level = google.get("price_level")
    if not low or not high:
        return 3.0 if level == "low" else (-3.0 if level == "high" else 0.0)
    midpoint = (low + high) / 2
    pct_below = (midpoint - price) / midpoint * 100
    score = 0.0
    if pct_below >= 30:  score = 15.0
    elif pct_below >= 20: score = 12.0
    elif pct_below >= 10: score = 8.0
    elif pct_below >= 0:  score = 4.0
    if level == "low":  score += 3.0
    if level == "high": score -= 3.0
    return max(0.0, score)


def _score_cross_source(xref: dict) -> float:
    """0–20 points based on how many sources confirm a low price."""
    n = len(xref.get("sources_confirmed", []))
    is_gem = xref.get("is_gem", False)
    if n >= 4:               return 20.0
    if n >= 3:               return 16.0
    if n >= 2:               return 12.0
    if n == 1 and is_gem:    return 15.0   # GEM bonus
    if n == 1:               return  5.0
    return 0.0


def _score_scarcity(seats: int | None) -> float:
    """0–5 points based on seats remaining."""
    if seats is None: return 0.0
    if seats == 1:    return 5.0
    if seats <= 3:    return 4.0
    if seats <= 5:    return 2.0
    if seats <= 10:   return 1.0
    return 0.0


def _score_fare_brand(price: float, duffel: dict | None, stats: dict | None) -> float:
    """0–10 points: Business Lite detected >30% below standard."""
    if not duffel or not stats:
        return 0.0
    brand = (duffel.get("fare_brand_name") or "").lower()
    if "lite" not in brand and "basic" not in brand:
        return 0.0
    avg = stats.get("avg_price")
    if avg and avg > 0 and (avg - price) / avg >= 0.30:
        return 10.0
    return 0.0


def _score_award(cash_price: float, awards: list[dict] | None) -> float:
    """0–50 bonus points from award availability (Phase 3 full impl)."""
    # Stub: Phase 3 will implement CPP calculation + scarcity + accessibility
    return 0.0


def _action(total: float, is_gem: bool) -> str:
    if is_gem or total >= 100: return "STRONG_BUY"
    if total >= 80:            return "BUY"
    if total >= 60:            return "WATCH"
    if total >= 40:            return "NORMAL"
    return "SKIP"


def _empty_score() -> dict:
    return {k: 0.0 for k in [
        "score_total", "score_percentile", "score_zscore", "score_trend_alignment",
        "score_trend_direction", "score_cross_source", "score_arbitrage",
        "score_fare_brand", "score_scarcity", "score_award",
    ]} | {"action": "SKIP", "is_gem": False, "is_error_fare": False,
           "percentile_position": None, "zscore": None, "google_price_level": None,
           "seats_remaining": None, "fare_brand_name": None}
