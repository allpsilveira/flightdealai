"""Short-term price forecast per (route, cabin).

Uses statsforecast's AutoARIMA on daily-min price series. Produces a 14-day
forecast with prediction intervals. Training is cheap (seconds per series),
so we re-fit weekly via the ml_retrain DAG.

Public API:
    fit_route(prices: list[dict]) -> dict | None
    forecast(model: dict, horizon: int = 14) -> list[dict] | None
    load_or_none(route_id, cabin) -> dict | None
    save(route_id, cabin, model_payload)

The "model" is a small dict with the historical series + fitted params.
We persist it as joblib for cheap reloads in scoring.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from pathlib import Path

import joblib

from . import MODEL_STORE

log = logging.getLogger(__name__)

_DIR = MODEL_STORE / "forecast"
_DIR.mkdir(parents=True, exist_ok=True)


def _path(route_id: str, cabin: str) -> Path:
    return _DIR / f"{route_id}__{cabin}.joblib"


def fit_route(prices: list[dict]) -> dict | None:
    """Fit AutoARIMA on a daily-min series.

    `prices` is a list of {"date": date, "price": float} entries (one per day).
    Returns a serializable model payload, or None if the series is too short.
    """
    if not prices or len(prices) < 21:
        return None

    try:
        import pandas as pd
        from statsforecast import StatsForecast
        from statsforecast.models import AutoARIMA
    except ImportError as e:
        log.warning("statsforecast not installed: %s", e)
        return None

    df = pd.DataFrame(prices)
    df["ds"] = pd.to_datetime(df["date"])
    df["y"] = df["price"].astype(float)
    df["unique_id"] = "series"
    df = df[["unique_id", "ds", "y"]].sort_values("ds")

    sf = StatsForecast(models=[AutoARIMA(season_length=7)], freq="D")
    sf.fit(df)

    return {
        "fit_at": datetime.utcnow().isoformat(),
        "n_observations": len(df),
        "last_date": df["ds"].max().isoformat(),
        "sf": sf,
    }


def forecast(model: dict, horizon: int = 14) -> list[dict] | None:
    """Return list of {date, mean, lo80, hi80} forecasts."""
    if not model or "sf" not in model:
        return None
    try:
        sf = model["sf"]
        out = sf.forecast(h=horizon, level=[80])
        # statsforecast columns: ds, AutoARIMA, AutoARIMA-lo-80, AutoARIMA-hi-80
        rows = []
        for _, r in out.iterrows():
            rows.append({
                "date": r["ds"].date().isoformat() if hasattr(r["ds"], "date") else str(r["ds"]),
                "mean": float(r.get("AutoARIMA", 0)),
                "lo80": float(r.get("AutoARIMA-lo-80", 0)),
                "hi80": float(r.get("AutoARIMA-hi-80", 0)),
            })
        return rows
    except Exception as e:
        log.warning("forecast failed: %s", e)
        return None


def save(route_id: str, cabin: str, payload: dict) -> None:
    joblib.dump(payload, _path(route_id, cabin))


def load_or_none(route_id: str, cabin: str) -> dict | None:
    p = _path(route_id, cabin)
    if not p.exists():
        return None
    try:
        return joblib.load(p)
    except Exception as e:
        log.warning("forecast load failed for %s/%s: %s", route_id, cabin, e)
        return None


def is_stale(model: dict, max_age_days: int = 8) -> bool:
    if not model or "fit_at" not in model:
        return True
    try:
        fit_at = datetime.fromisoformat(model["fit_at"])
        return (datetime.utcnow() - fit_at) > timedelta(days=max_age_days)
    except Exception:
        return True
