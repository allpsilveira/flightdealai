"""
Twilio WhatsApp Business API client.
Sends deal alerts and weekly briefings.
"""
import structlog
from typing import Any

from app.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()


async def send_deal_alert(
    to_number: str,
    deal: dict[str, Any],
    recommendation: str | None,
    language: str = "en",
) -> bool:
    """
    Sends a WhatsApp deal alert to the user's number.
    Returns True on success, False on failure.
    """
    if not all([settings.twilio_account_sid, settings.twilio_auth_token, settings.twilio_whatsapp_from]):
        logger.warning("whatsapp_not_configured")
        return False

    message = _format_deal_message(deal, recommendation, language)
    return await _send(to_number, message)


async def send_weekly_briefing(
    to_number: str,
    briefing: str,
) -> bool:
    return await _send(to_number, briefing)


async def _send(to_number: str, body: str) -> bool:
    try:
        from twilio.rest import Client
        client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
        to_wa = f"whatsapp:{to_number}" if not to_number.startswith("whatsapp:") else to_number
        client.messages.create(
            from_=settings.twilio_whatsapp_from,
            to=to_wa,
            body=body,
        )
        logger.info("whatsapp_sent", to=to_number)
        return True
    except Exception as exc:
        logger.warning("whatsapp_send_failed", to=to_number, error=str(exc))
        return False


def _format_deal_message(deal: dict, rec: str | None, language: str) -> str:
    price     = deal.get("best_price_usd", 0)
    origin    = deal.get("origin", "")
    dest      = deal.get("destination", "")
    cabin     = deal.get("cabin_class", "").replace("_", " ").title()
    action    = deal.get("action", "")
    score     = deal.get("score_total", 0)
    seats     = deal.get("seats_remaining")
    is_gem    = deal.get("is_gem", False)

    if language == "pt":
        gem_tag   = "✦ OFERTA GEM" if is_gem else ""
        seat_line = f"\n⚠️ Apenas {seats} assento(s) disponível(is)!" if seats and seats <= 5 else ""
        msg = (
            f"{'✦ OFERTA GEM — ' if is_gem else ''}{action.replace('_', ' ')}\n"
            f"✈️ {origin} → {dest} ({cabin})\n"
            f"💰 ${price:,.0f} · Pontuação: {score:.0f}/170"
            f"{seat_line}\n"
        )
    else:
        seat_line = f"\n⚠️ Only {seats} seat(s) left!" if seats and seats <= 5 else ""
        msg = (
            f"{'✦ GEM DEAL — ' if is_gem else ''}{action.replace('_', ' ')}\n"
            f"✈️ {origin} → {dest} ({cabin})\n"
            f"💰 ${price:,.0f} · Score: {score:.0f}/170"
            f"{seat_line}\n"
        )

    if rec:
        msg += f"\n{rec}"

    msg += "\n\n_FlightDeal AI_"
    return msg
