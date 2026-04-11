"""
Cross-reference engine — Phase 3 full implementation.
Stub here: accepts raw results from all sources, returns a unified best price
and a GEM flag (price confirmed by only one source but anomalously low).
"""
import structlog
from typing import Any

logger = structlog.get_logger(__name__)


def cross_reference(
    google_result:  dict | None,
    duffel_result:  dict | None = None,
    award_results:  list[dict] | None = None,
) -> dict[str, Any]:
    """
    Combines results from active sources into a unified cross-reference summary.
    Sources: SerpApi (Google Flights), Duffel (on-demand), Seats.aero (on-demand).

    Returns:
        {
          best_price_usd: float,
          best_source: str,
          sources_confirmed: [str],
          is_gem: bool,
          price_by_source: {source: price},
          airline_codes: [str],
          seats_remaining: int | None,
        }
    """
    prices: dict[str, float] = {}
    all_airlines: list[str] = []
    seats_remaining: int | None = None

    if google_result and google_result.get("price_usd"):
        prices["serpapi"] = google_result["price_usd"]
        all_airlines.extend(google_result.get("airline_codes", []))

    if duffel_result and duffel_result.get("price_usd"):
        prices["duffel"] = duffel_result["price_usd"]
        all_airlines.extend(duffel_result.get("airline_codes", []))

    if not prices:
        return {
            "best_price_usd":    None,
            "best_source":       None,
            "sources_confirmed": [],
            "is_gem":            False,
            "price_by_source":   {},
            "airline_codes":     [],
            "seats_remaining":   None,
        }

    best_source = min(prices, key=prices.__getitem__)
    best_price  = prices[best_source]

    # A source "confirms" if its price is within 5% of the best
    threshold = best_price * 1.05
    confirmed = [src for src, p in prices.items() if p <= threshold]

    # GEM: price is significantly below Google's typical range
    is_gem = False
    if google_result:
        typical_high = google_result.get("typical_price_high")
        if typical_high and best_price < typical_high * 0.6:
            is_gem = True

    return {
        "best_price_usd":    best_price,
        "best_source":       best_source,
        "sources_confirmed": confirmed,
        "is_gem":            is_gem,
        "price_by_source":   prices,
        "airline_codes":     list(set(filter(None, all_airlines))),
        "seats_remaining":   seats_remaining,
    }
