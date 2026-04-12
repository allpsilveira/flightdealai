"""
Claude AI advisor — generates deal recommendation text in EN + PT.
Uses claude-sonnet-4-6 for routine analysis, claude-opus-4-6 for complex deals.
Includes prompt caching on the system prompt to minimize token costs.
"""
import structlog
from typing import Any

import anthropic

from app.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()

# Cached system prompt — stable across calls, eligible for Anthropic prompt caching
_SYSTEM_PROMPT = """\
You are a luxury travel deal analyst for FlyLuxuryDeals, serving Gabriel, \
a dual US-Brazilian citizen who flies primarily between South Florida (MIA/MCO/FLL) \
and Brazil (GRU/CNF). You specialize in Business, First, and Premium Economy class \
award and cash fares.

When analyzing a deal, provide:
1. A concise verdict (1-2 sentences) — is this worth booking now?
2. Key context — what makes the price notable (percentile, trend, source validation)
3. Action recommendation — book now / watch / wait for drop / redeem miles instead

Style: Confident, informed, concise. Like advice from a well-traveled friend who \
happens to be a points expert. Never use generic filler phrases. Be specific.\
"""


async def generate_recommendation(
    deal: dict[str, Any],
    language: str = "en",
) -> str | None:
    """
    Generates an AI recommendation for a scored deal.
    Returns the recommendation string or None on failure.
    Language: "en" or "pt"
    """
    if not settings.anthropic_api_key:
        logger.warning("claude_no_key")
        return None

    # Use Opus for STRONG_BUY/GEM, Sonnet for everything else
    action = deal.get("action", "NORMAL")
    is_gem = deal.get("is_gem", False)
    model = "claude-opus-4-6" if (action == "STRONG_BUY" or is_gem) else "claude-sonnet-4-6"

    user_prompt = _build_prompt(deal, language)

    try:
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        response = await client.messages.create(
            model=model,
            max_tokens=300,
            system=[
                {
                    "type": "text",
                    "text": _SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},   # prompt caching
                }
            ],
            messages=[{"role": "user", "content": user_prompt}],
        )
        return response.content[0].text.strip()
    except Exception as exc:
        logger.warning("claude_recommendation_failed", error=str(exc))
        return None


async def generate_weekly_briefing(
    route_summaries: list[dict],
    language: str = "en",
) -> str | None:
    """Weekly market summary sent via WhatsApp every Monday."""
    if not settings.anthropic_api_key:
        return None
    try:
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        lang_instruction = "Respond in Brazilian Portuguese." if language == "pt" else "Respond in English."
        response = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=600,
            system=[{"type": "text", "text": _SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
            messages=[{
                "role": "user",
                "content": (
                    f"Generate a weekly flight deal briefing. {lang_instruction}\n\n"
                    f"Route summaries this week:\n{route_summaries}\n\n"
                    "Cover: best deals seen, price trends, when to book, what to avoid."
                ),
            }],
        )
        return response.content[0].text.strip()
    except Exception as exc:
        logger.warning("claude_briefing_failed", error=str(exc))
        return None


def _build_prompt(deal: dict, language: str) -> str:
    lang = "Brazilian Portuguese" if language == "pt" else "English"
    score = deal.get("score_total", 0)
    action = deal.get("action", "NORMAL")
    origin = deal.get("origin", "")
    destination = deal.get("destination", "")
    cabin = deal.get("cabin_class", "")
    price = deal.get("best_price_usd", 0)
    percentile = deal.get("percentile_position")
    zscore = deal.get("zscore")
    google_level = deal.get("google_price_level")
    seats = deal.get("seats_remaining")
    fare_brand = deal.get("fare_brand_name")
    award_miles = deal.get("best_award_miles")
    award_program = deal.get("best_award_program")
    cpp = deal.get("best_cpp")
    sources = deal.get("sources_confirmed", [])

    parts = [
        f"Analyze this flight deal. Respond in {lang}. Be concise (2-3 sentences max).",
        f"Route: {origin} → {destination} | Cabin: {cabin}",
        f"Price: ${price:,.0f} | Score: {score:.0f}/170 | Action: {action}",
    ]
    if percentile:
        parts.append(f"Price is at the {percentile:.0f}th percentile of 90-day history.")
    if zscore:
        parts.append(f"Z-score: {zscore:.1f} standard deviations below the mean.")
    if google_level:
        parts.append(f"Google Flights rates this price as: {google_level.upper()}.")
    if sources:
        parts.append(f"Confirmed by: {', '.join(sources)}.")
    if seats:
        parts.append(f"Seats remaining: {seats}.")
    if fare_brand:
        parts.append(f"Fare brand: {fare_brand}.")
    if award_miles and award_program:
        parts.append(f"Award alternative: {award_miles:,} miles via {award_program} ({cpp:.1f}¢/pt).")

    return "\n".join(parts)
