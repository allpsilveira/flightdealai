"""
Web Push Notifications (Web Push Protocol / VAPID).
Sends browser push notifications to subscribed users.
Uses pywebpush library with VAPID auth.

Setup required:
  1. Generate VAPID keys:  python -c "from py_vapid import Vapid; v=Vapid(); v.generate_keys(); print(v.public_key, v.private_key)"
  2. Set env vars: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CLAIM_EMAIL
  3. Frontend: register service worker + subscribe with the public key
"""
import json
import structlog
from typing import Any

from app.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()


async def send_push_notification(
    subscription: dict[str, Any],
    deal: dict[str, Any],
    recommendation: str | None = None,
    language: str = "en",
) -> bool:
    """
    Sends a Web Push notification to a single browser subscription.
    subscription = {endpoint, keys: {p256dh, auth}} (standard PushSubscription JSON)
    Returns True on success.
    """
    if not _vapid_configured():
        logger.warning("web_push_vapid_not_configured")
        return False

    payload = _build_payload(deal, recommendation, language)

    try:
        from pywebpush import Webpush, WebpushException
        wp = Webpush(
            public_key=settings.vapid_public_key,
            private_key=settings.vapid_private_key,
            subscriber=f"mailto:{settings.vapid_claim_email}",
        )
        wp.send(json.dumps(payload), subscription)
        logger.info("web_push_sent", endpoint=subscription.get("endpoint", "")[:40])
        return True
    except Exception as exc:
        logger.warning("web_push_failed", error=str(exc))
        return False


def _vapid_configured() -> bool:
    return bool(
        getattr(settings, "vapid_private_key", None)
        and getattr(settings, "vapid_public_key", None)
        and getattr(settings, "vapid_claim_email", None)
    )


def _build_payload(deal: dict, rec: str | None, language: str) -> dict:
    price  = deal.get("best_price_usd", 0)
    origin = deal.get("origin", "")
    dest   = deal.get("destination", "")
    cabin  = deal.get("cabin_class", "").replace("_", " ").title()
    action = deal.get("action", "")
    is_gem = deal.get("is_gem", False)
    score  = deal.get("score_total", 0)

    if language == "pt":
        title = f"{'✦ GEM · ' if is_gem else ''}{action.replace('_', ' ')} — {origin}→{dest}"
        body  = f"{cabin} · ${price:,.0f} · Pontuação {score:.0f}/170"
    else:
        title = f"{'✦ GEM Deal · ' if is_gem else ''}{action.replace('_', ' ')} — {origin}→{dest}"
        body  = f"{cabin} · ${price:,.0f} · Score {score:.0f}/170"

    if rec:
        body = rec[:120] + ("…" if len(rec) > 120 else "")

    return {
        "title":  title,
        "body":   body,
        "icon":   "/icon-192.png",
        "badge":  "/badge-72.png",
        "tag":    f"deal-{origin}-{dest}",   # replaces previous notification for same route
        "data":   {"origin": origin, "destination": dest, "score": score},
    }
