"""
Twilio webhook endpoint.
Twilio POSTs here for:
  - Delivery status callbacks (sent, delivered, failed, undelivered)
  - Inbound messages — handles STOP/opt-out and passes others to AI if desired

Configure in Twilio console:
  Messaging → Senders → WhatsApp Senders → your number → Webhook URL:
    https://flyluxurydeals.com/api/webhooks/twilio

Twilio validates requests using its signature header. Validation is enforced
when TWILIO_AUTH_TOKEN is set in env.
"""
import structlog
from fastapi import APIRouter, Form, Request, Response, HTTPException
from app.config import get_settings

logger = structlog.get_logger(__name__)
settings = get_settings()

router = APIRouter()


@router.post("/twilio", include_in_schema=False)
async def twilio_webhook(
    request: Request,
    # Standard Twilio status callback fields
    MessageSid: str | None = Form(None),
    MessageStatus: str | None = Form(None),
    # Inbound message fields
    From: str | None = Form(None),
    Body: str | None = Form(None),
    To: str | None = Form(None),
):
    """
    Handles both status callbacks and inbound WhatsApp messages from Twilio.
    Returns 200 with empty TwiML body (required by Twilio even when not replying).
    """
    await _validate_twilio_signature(request)

    # ── Status callback (delivery receipt) ────────────────────────────────────
    if MessageStatus:
        logger.info(
            "twilio_delivery_status",
            sid=MessageSid,
            status=MessageStatus,
        )
        # Log failures prominently so you can debug
        if MessageStatus in ("failed", "undelivered"):
            logger.warning("twilio_delivery_failed", sid=MessageSid, status=MessageStatus)
        return Response(content="<Response/>", media_type="application/xml")

    # ── Inbound message ───────────────────────────────────────────────────────
    if From and Body:
        body_clean = (Body or "").strip().upper()
        from_number = From.replace("whatsapp:", "")

        logger.info("twilio_inbound", from_=from_number, body_preview=body_clean[:30])

        # Handle opt-out (Twilio auto-manages STOP, but log it)
        if body_clean in ("STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"):
            logger.info("whatsapp_opt_out", number=from_number)
            # Twilio handles the actual opt-out — no DB action needed here
            # unless you want to flip a flag in your own user table

        # Handle opt back in
        elif body_clean in ("START", "SUBSCRIBE", "UNSTOP"):
            logger.info("whatsapp_opt_in", number=from_number)

    return Response(content="<Response/>", media_type="application/xml")


async def _validate_twilio_signature(request: Request) -> None:
    """
    Validates the X-Twilio-Signature header to ensure the request came from Twilio.
    Skipped in dev (no auth token configured).
    """
    if not settings.twilio_auth_token:
        return  # dev mode — no validation

    try:
        from twilio.request_validator import RequestValidator
        validator = RequestValidator(settings.twilio_auth_token)

        signature = request.headers.get("X-Twilio-Signature", "")
        # Must use the full public URL Twilio posted to — check X-Forwarded-Proto behind proxy
        proto = request.headers.get("X-Forwarded-Proto", request.url.scheme)
        url = str(request.url).replace(f"{request.url.scheme}://", f"{proto}://", 1)

        # Twilio signs against the sorted POST params
        form_data = dict(await request.form())

        if not validator.validate(url, form_data, signature):
            logger.warning("twilio_invalid_signature", url=url)
            raise HTTPException(status_code=403, detail="Invalid Twilio signature")
    except ImportError:
        pass  # twilio not installed — skip validation
