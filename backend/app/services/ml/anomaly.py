"""Per-(route, cabin) IsolationForest for error-fare detection.

The hand-rolled scoring already flags z>2.5 as "possible error fare". This
adds a learned multivariate detector — features include price, day-of-week,
days-to-departure, season, airline-mix. Output is an `anomaly_score` in
[-1, 1] (lower = more anomalous) plus a binary `is_anomaly` flag.

Public API:
    fit(rows: list[dict]) -> dict | None
    score(model: dict, row: dict) -> dict | None  # {anomaly_score, is_anomaly}
    save(route_id, cabin, payload)
    load_or_none(route_id, cabin)
"""
from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path

import joblib

from . import MODEL_STORE

log = logging.getLogger(__name__)

_DIR = MODEL_STORE / "anomaly"
_DIR.mkdir(parents=True, exist_ok=True)

_FEATURES = ["price", "dow", "days_out", "month"]


def _path(route_id: str, cabin: str) -> Path:
    return _DIR / f"{route_id}__{cabin}.joblib"


def _featurize(row: dict) -> list[float]:
    return [
        float(row.get("price", 0) or 0),
        int(row.get("dow", 0) or 0),
        int(row.get("days_out", 0) or 0),
        int(row.get("month", 0) or 0),
    ]


def fit(rows: list[dict]) -> dict | None:
    """`rows` items must contain price, dow, days_out, month."""
    if not rows or len(rows) < 30:
        return None
    try:
        from sklearn.ensemble import IsolationForest
    except ImportError as e:
        log.warning("sklearn missing: %s", e)
        return None

    X = [_featurize(r) for r in rows]
    model = IsolationForest(
        n_estimators=200,
        contamination="auto",
        random_state=42,
    )
    model.fit(X)

    return {
        "fit_at": datetime.utcnow().isoformat(),
        "n_observations": len(rows),
        "model": model,
        "features": _FEATURES,
    }


def score(model: dict, row: dict) -> dict | None:
    if not model or "model" not in model:
        return None
    try:
        clf = model["model"]
        x = [_featurize(row)]
        s = float(clf.decision_function(x)[0])
        is_anom = bool(clf.predict(x)[0] == -1)
        return {"anomaly_score": s, "is_anomaly": is_anom}
    except Exception as e:
        log.warning("anomaly score failed: %s", e)
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
        log.warning("anomaly load failed for %s/%s: %s", route_id, cabin, e)
        return None
