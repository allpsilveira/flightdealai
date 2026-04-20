"""ML inference orchestrator.

Pulls the three model outputs (forecast, anomaly, expected-price) for a
given deal and returns a unified `signals` dict consumable by:
  - the API layer (/api/ml/explain/{deal_id})
  - the ScoreExplainer (extra plain-English drivers when ML data exists)

All loaders are cheap (joblib reload) and tolerate missing artifacts —
returns a payload with `available: false` if no models are present.
"""
from __future__ import annotations

import logging
from datetime import date

from . import forecaster, anomaly, expected_price

log = logging.getLogger(__name__)


def signals_for_deal(deal_ctx: dict) -> dict:
    """deal_ctx must contain:
        route_id, cabin_class, origin, destination, airline_code,
        price (best cash), departure_date (ISO or date)
    """
    route_id = str(deal_ctx.get("route_id") or "")
    cabin = deal_ctx.get("cabin_class") or ""
    price = float(deal_ctx.get("price") or 0)

    dep = deal_ctx.get("departure_date")
    if isinstance(dep, str):
        try:
            dep = date.fromisoformat(dep[:10])
        except Exception:
            dep = None

    today = date.today()
    days_out = max((dep - today).days, 0) if dep else 0
    dow = dep.weekday() if dep else 0
    month = dep.month if dep else today.month

    out: dict = {"available": False}

    # Forecast (per route, cabin)
    fmodel = forecaster.load_or_none(route_id, cabin)
    if fmodel:
        fc = forecaster.forecast(fmodel, horizon=14)
        if fc:
            mean14 = sum(p["mean"] for p in fc) / len(fc)
            out["forecast"] = {
                "horizon_days": 14,
                "mean_14d": round(mean14, 2),
                "vs_current_pct": round(((mean14 - price) / price) if price else 0, 4),
                "fit_at": fmodel.get("fit_at"),
                "points": fc,
            }
            out["available"] = True

    # Anomaly (per route, cabin)
    amodel = anomaly.load_or_none(route_id, cabin)
    if amodel:
        sc = anomaly.score(
            amodel,
            {"price": price, "dow": dow, "days_out": days_out, "month": month},
        )
        if sc:
            out["anomaly"] = sc
            out["available"] = True

    # Expected price (global LightGBM)
    em = expected_price.load_or_none()
    if em:
        pred = expected_price.predict(em, {
            "origin": deal_ctx.get("origin"),
            "destination": deal_ctx.get("destination"),
            "cabin_class": cabin,
            "airline_code": deal_ctx.get("airline_code") or "_unk",
            "days_out": days_out,
            "dow": dow,
            "month": month,
            "price": price,
        }, top_n=3)
        if pred:
            out["expected_price"] = pred
            out["available"] = True

    return out


def ml_drivers(signals: dict) -> list[dict]:
    """Translate ML signals into ScoreExplainer-shaped driver entries."""
    drivers: list[dict] = []
    if not signals or not signals.get("available"):
        return drivers

    fc = signals.get("forecast") or {}
    if fc:
        pct = fc.get("vs_current_pct", 0)
        if pct > 0.04:
            drivers.append({
                "label": "Forecast",
                "weight_pct": min(abs(pct) * 5, 1.0),
                "tone": "emerald",
                "text": f"Model expects price to rise ~{round(pct*100)}% over the next 14 days — buying now beats waiting.",
            })
        elif pct < -0.04:
            drivers.append({
                "label": "Forecast",
                "weight_pct": min(abs(pct) * 5, 1.0),
                "tone": "amber",
                "text": f"Model expects price to drop ~{round(abs(pct)*100)}% over the next 14 days — waiting may pay off.",
            })

    anom = signals.get("anomaly") or {}
    if anom.get("is_anomaly"):
        drivers.append({
            "label": "Anomaly",
            "weight_pct": 0.85,
            "tone": "rose",
            "text": "Multivariate detector flagged this as unusual — possible error fare or pricing glitch.",
        })

    exp = signals.get("expected_price") or {}
    if exp:
        residual = exp.get("residual_pct", 0)
        if residual < -0.10:
            drivers.append({
                "label": "vs expected",
                "weight_pct": min(abs(residual) * 3, 1.0),
                "tone": "emerald",
                "text": f"Trained model expected ~${round(exp['expected']):,} for this combo — current is {round(abs(residual)*100)}% lower.",
            })
        elif residual > 0.15:
            drivers.append({
                "label": "vs expected",
                "weight_pct": min(abs(residual) * 2, 1.0),
                "tone": "amber",
                "text": f"Trained model expected ~${round(exp['expected']):,} — current is {round(residual*100)}% higher.",
            })

    return drivers
