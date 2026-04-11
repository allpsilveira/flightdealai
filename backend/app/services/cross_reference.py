"""
Cross-reference engine — Phase 3 full implementation.
Stub here: accepts raw results from all sources, returns a unified best price
and a GEM flag (price confirmed by only one source but anomalously low).
"""
import structlog
from typing import Any

logger = structlog.get_logger(__name__)


def cross_reference(
    amadeus_results: list[dict] | None,
    google_result:   dict | None,
    kiwi_results:    list[dict] | None,
) -> dict[str, Any]:
    """
    Combines results from Tier 1/2 sources into a single cross-reference summary.

    Returns:
        {
          best_price_usd: float,
          best_source: str,
          sources_confirmed: [str],    # sources that agree price is low
          is_gem: bool,                # single-source anomaly
          price_by_source: {source: price},
          airline_codes: [str],
          seats_remaining: int | None,
        }
    """
    prices: dict[str, float] = {}
    all_airlines: list[str] = []
    seats_remaining: int | None = None

    if amadeus_results:
        cheapest = min(amadeus_results, key=lambda r: r["price_usd"], default=None)
        if cheapest:
            prices["amadeus"] = cheapest["price_usd"]
            all_airlines.extend(cheapest.get("airline_codes", []))
            seats_remaining = cheapest.get("seats_remaining")

    if google_result and google_result.get("price_usd"):
        prices["google"] = google_result["price_usd"]
        all_airlines.extend(google_result.get("airline_codes", []))

    if kiwi_results:
        cheapest = min(kiwi_results, key=lambda r: r["price_usd"], default=None)
        if cheapest:
            prices["kiwi"] = cheapest["price_usd"]
            all_airlines.extend(cheapest.get("airline_codes", []))

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

    # GEM: only one source has data AND it's significantly below Google's typical range
    is_gem = False
    if len(prices) == 1 and google_result:
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
