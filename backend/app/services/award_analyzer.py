"""
Award CPP calculator + transfer partner mapper.
Phase 3 full implementation. Stub here computes CPP when cash price is known.
"""
import json
import os
import structlog
from typing import Any

logger = structlog.get_logger(__name__)

_baselines: dict[str, float] | None = None
_partners:  list[dict] | None = None


def _load_baselines() -> dict[str, float]:
    global _baselines
    if _baselines is None:
        path = os.path.join(os.path.dirname(__file__), "..", "data", "program_baselines.json")
        with open(path) as f:
            data = json.load(f)
        _baselines = {item["program_code"]: item["baseline_cpp"] for item in data}
    return _baselines


def _load_partners() -> list[dict]:
    global _partners
    if _partners is None:
        path = os.path.join(os.path.dirname(__file__), "..", "data", "transfer_partners.json")
        with open(path) as f:
            _partners = json.load(f)
    return _partners


def enrich_awards(
    cash_price_usd: float,
    award_results: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Calculates CPP for each award result and tags accessible card programs.
    Returns enriched award list sorted by CPP descending.
    """
    baselines = _load_baselines()
    partners  = _load_partners()

    enriched = []
    for award in award_results:
        miles = award.get("miles_cost", 0)
        taxes = award.get("cash_taxes_usd", 0.0)
        if not miles:
            continue

        # CPP = (cash_price - taxes) / miles * 100  →  cents per point
        effective_cash = cash_price_usd - taxes
        cpp = (effective_cash / miles * 100) if miles > 0 else 0.0

        program = award.get("loyalty_program", "")
        baseline = baselines.get(program, 1.5)
        cpp_vs_baseline = cpp / baseline if baseline else 0.0

        # Which card programs can transfer to this loyalty program?
        accessible_card_programs = [
            p["card_program"] for p in partners
            if p["airline_program"].startswith(program) and p.get("is_active", True)
        ]

        enriched.append({
            **award,
            "cpp_value":               round(cpp, 2),
            "cpp_vs_baseline":         round(cpp_vs_baseline, 2),
            "accessible_card_programs": accessible_card_programs,
        })

    return sorted(enriched, key=lambda x: x["cpp_value"], reverse=True)


def best_award_summary(enriched: list[dict]) -> dict[str, Any]:
    """Returns the single best award option for DealAnalysis storage."""
    if not enriched:
        return {"best_award_miles": None, "best_award_program": None, "best_cpp": None}
    best = enriched[0]
    return {
        "best_award_miles":   best["miles_cost"],
        "best_award_program": best["loyalty_program"],
        "best_cpp":           best["cpp_value"],
    }
