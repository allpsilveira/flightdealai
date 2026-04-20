"""
Plain-English score explainer.

Deterministic — no LLM call, no cost. Translates the raw sub-scores from
DealAnalysis into a verdict + a list of human-readable drivers, ranked by
how much each one moved the total.

Output shape:
    {
        "headline":   str,        # one line, e.g. "Strong deal — well below typical"
        "verdict":    str,        # short label: "Strong deal" | "Good deal" | "Watch it" | "Skip"
        "verdict_tone": str,      # "emerald" | "champagne" | "amber" | "zinc"
        "summary":    str,        # 1-2 sentence plain-English explanation
        "drivers":    [{label, weight, plain, tone, raw}, ...],  # sorted by weight desc
        "confidence": str,        # "low" | "medium" | "high" — based on data sufficiency
        "raw_total":  float,      # 0..170
        "normalized": float,      # 0..10
    }
"""
from __future__ import annotations
from typing import Any


# Max points per sub-score (matches CLAUDE.md scoring engine)
_MAX = {
    "percentile":      30,
    "zscore":          20,
    "trend_alignment": 15,
    "trend_direction": 10,
    "cross_source":    20,
    "arbitrage":       10,
    "fare_brand":      10,
    "scarcity":         5,
    "award":           50,
}


def _verdict(action: str, is_gem: bool, is_error_fare: bool) -> tuple[str, str, str]:
    """Returns (verdict, tone, headline)."""
    if is_error_fare:
        return ("Possible error fare", "emerald", "Possible error fare — book fast if it's real")
    if is_gem:
        return ("Hidden gem", "emerald", "Hidden gem — only one source has this price")
    if action == "STRONG_BUY":
        return ("Strong deal", "emerald", "Strong deal — well below typical for this route")
    if action == "BUY":
        return ("Good deal", "champagne", "Good deal — meaningfully below typical")
    if action == "WATCH":
        return ("Watch it", "amber", "Worth watching — fair price, could improve")
    if action == "SKIP":
        return ("Skip", "zinc", "Skip — priced above the typical range")
    return ("Normal", "zinc", "Normal — sitting around the typical price")


def _percentile_plain(deal: dict[str, Any]) -> str | None:
    p = deal.get("percentile_position")
    if p is None:
        return None
    pct = round(p * 100)
    if pct <= 5:   return f"Cheaper than {100 - pct}% of fares we've tracked on this route"
    if pct <= 20:  return f"In the bottom {pct}% of prices for this route"
    if pct <= 40:  return f"Below the median — bottom {pct}% of recent prices"
    if pct <= 60:  return "Right around the median price"
    return f"In the top {100 - pct}% of recent prices — relatively expensive"


def _zscore_plain(deal: dict[str, Any]) -> str | None:
    z = deal.get("zscore")
    if z is None:
        return None
    if z <= -2.5: return "Statistically anomalous — more than 2.5σ below the mean (possible error fare)"
    if z <= -2.0: return "Far below the mean — over 2σ cheaper than typical"
    if z <= -1.5: return "Significantly below the mean"
    if z <= -1.0: return "Below the mean by a meaningful margin"
    if z <= -0.5: return "Slightly below the mean"
    return "Around or above the mean price"


def _trend_align_plain(deal: dict[str, Any]) -> str | None:
    lvl = deal.get("google_price_level")
    low, high = deal.get("typical_price_low"), deal.get("typical_price_high")
    price = deal.get("best_price_usd")
    parts = []
    if lvl:
        parts.append(f"Google labels this fare as **{lvl.upper()}**")
    if low and high and price:
        if price < low:
            parts.append(f"sitting below the typical ${int(low):,}–${int(high):,} range")
        elif price > high:
            parts.append(f"above the typical ${int(low):,}–${int(high):,} range")
        else:
            parts.append(f"inside the typical ${int(low):,}–${int(high):,} band")
    return " — ".join(parts) if parts else None


def _trend_dir_plain(deal: dict[str, Any]) -> str | None:
    pts = deal.get("score_trend_direction") or 0
    if pts >= 9:  return "7-day trend is falling fast — momentum is in your favor"
    if pts >= 6:  return "7-day trend is dropping"
    if pts >= 2:  return "Prices are stable over the last 7 days"
    if pts > 0:   return "Slight uptrend"
    if pts == 0:  return "Trend signal not strong enough to rate"
    return "Prices are spiking — consider waiting"


def _cross_source_plain(deal: dict[str, Any]) -> str | None:
    sources = deal.get("sources_confirmed") or []
    n = len(sources)
    if n >= 3: return f"Confirmed by {n} sources — high confidence this price is real"
    if n == 2: return "Two sources agree on this price"
    if n == 1: return f"Only {sources[0]} has this price right now (single-source — verify before booking)"
    return None


def _arbitrage_plain(deal: dict[str, Any]) -> str | None:
    pts = deal.get("score_arbitrage") or 0
    if pts >= 9: return "Big airport arbitrage — a nearby airport saves over 30%"
    if pts >= 6: return "Decent airport arbitrage — alternate airport saves 20%+"
    if pts >= 4: return "Small airport savings vs nearby alternatives"
    return None


def _fare_brand_plain(deal: dict[str, Any]) -> str | None:
    brand = deal.get("fare_brand_name")
    pts = deal.get("score_fare_brand") or 0
    if brand and pts >= 8:
        return f"Discount fare brand detected: **{brand}** — restrictions apply but priced 30%+ below standard"
    if brand:
        return f"Fare brand: {brand}"
    return None


def _scarcity_plain(deal: dict[str, Any]) -> str | None:
    seats = deal.get("seats_remaining")
    if seats is None:
        return None
    if seats == 1: return "Only **1 seat** left at this price"
    if seats <= 3: return f"Only **{seats} seats** left at this price"
    if seats <= 5: return f"{seats} seats remaining"
    return None


def _award_plain(deal: dict[str, Any]) -> str | None:
    miles = deal.get("best_award_miles")
    program = deal.get("best_award_program")
    cpp = deal.get("best_cpp")
    if not miles:
        return None
    parts = [f"Award available: **{miles:,} {program} miles**"]
    if cpp and cpp >= 5:
        parts.append(f"exceptional value at {cpp:.1f}¢/pt")
    elif cpp and cpp >= 3:
        parts.append(f"strong value at {cpp:.1f}¢/pt")
    elif cpp and cpp >= 2:
        parts.append(f"solid value at {cpp:.1f}¢/pt")
    return " — ".join(parts)


# Each entry: (key in deal, max points, label, plain-English builder)
_DRIVERS = [
    ("score_percentile",      _MAX["percentile"],      "Percentile position",     _percentile_plain),
    ("score_zscore",          _MAX["zscore"],          "Statistical anomaly",     _zscore_plain),
    ("score_trend_alignment", _MAX["trend_alignment"], "Vs Google typical range", _trend_align_plain),
    ("score_trend_direction", _MAX["trend_direction"], "Recent trend",            _trend_dir_plain),
    ("score_cross_source",    _MAX["cross_source"],    "Source agreement",        _cross_source_plain),
    ("score_arbitrage",       _MAX["arbitrage"],       "Airport arbitrage",       _arbitrage_plain),
    ("score_fare_brand",      _MAX["fare_brand"],      "Fare brand value",        _fare_brand_plain),
    ("score_scarcity",        _MAX["scarcity"],        "Seat scarcity",           _scarcity_plain),
    ("score_award",           _MAX["award"],           "Award option",            _award_plain),
]


def _tone_for(weight_pct: float) -> str:
    """How filled is this driver — for color coding."""
    if weight_pct >= 0.7: return "emerald"
    if weight_pct >= 0.4: return "champagne"
    if weight_pct >= 0.15: return "amber"
    return "zinc"


def _confidence(deal: dict[str, Any]) -> str:
    """How much should we trust this score?"""
    has_pct  = deal.get("percentile_position") is not None
    has_z    = deal.get("zscore") is not None
    sources  = len(deal.get("sources_confirmed") or [])
    if has_pct and has_z and sources >= 2: return "high"
    if has_pct and has_z:                  return "medium"
    if has_pct or sources >= 1:            return "low"
    return "low"


def _summary(deal: dict[str, Any], verdict: str, drivers: list[dict]) -> str:
    """Stitch top-2 drivers into a 1-2 sentence summary."""
    price = deal.get("best_price_usd")
    low, high = deal.get("typical_price_low"), deal.get("typical_price_high")

    bits = []
    if price and low and high:
        mid = (low + high) / 2
        if price < low:
            saved = int(mid - price)
            bits.append(f"At ${int(price):,}, this fare is roughly ${saved:,} below Google's typical mid-range.")
        elif price <= high:
            bits.append(f"At ${int(price):,}, this fare sits inside the typical ${int(low):,}–${int(high):,} band.")
        else:
            bits.append(f"At ${int(price):,}, this fare is above the typical ${int(low):,}–${int(high):,} band.")
    elif price:
        bits.append(f"At ${int(price):,} — we don't have enough history to position it yet.")

    # Add the strongest driver as the second sentence
    top = next((d for d in drivers if d["plain"]), None)
    if top:
        bits.append(top["plain"].rstrip(".") + ".")

    return " ".join(bits)


def explain_deal(deal: dict[str, Any]) -> dict[str, Any]:
    """Convert a DealAnalysis dict into a plain-English explanation payload."""

    drivers: list[dict[str, Any]] = []
    for key, max_pts, label, builder in _DRIVERS:
        raw = float(deal.get(key) or 0)
        weight_pct = raw / max_pts if max_pts else 0.0
        plain = builder(deal)
        drivers.append({
            "label":      label,
            "raw":        round(raw, 2),
            "max":        max_pts,
            "weight":     round(weight_pct, 3),
            "plain":      plain,
            "tone":       _tone_for(weight_pct),
        })

    # Sort by weight desc — biggest contributors first
    drivers.sort(key=lambda d: d["weight"], reverse=True)

    action = deal.get("action") or "NORMAL"
    verdict, tone, headline = _verdict(action, bool(deal.get("is_gem")), bool(deal.get("is_error_fare")))

    raw_total  = float(deal.get("score_total") or 0)
    normalized = round(raw_total / 17.0, 1)  # 170 / 10 == 17

    return {
        "headline":     headline,
        "verdict":      verdict,
        "verdict_tone": tone,
        "summary":      _summary(deal, verdict, drivers),
        "drivers":      drivers,
        "confidence":   _confidence(deal),
        "raw_total":    round(raw_total, 1),
        "normalized":   normalized,
        "action":       action,
        "is_gem":       bool(deal.get("is_gem")),
        "is_error_fare": bool(deal.get("is_error_fare")),
    }
