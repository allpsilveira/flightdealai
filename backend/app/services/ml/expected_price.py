"""Expected-price model — global LightGBM regressor.

Predicts what the cheapest cash price *should* be for a given
(origin, destination, cabin, days_out, dow, month). The deviation from
expected (`actual / expected`) is a high-quality signal for the scorer.

Also exposes SHAP top-N feature attributions per prediction → these become
plain-English drivers in the ScoreExplainer.

Public API:
    fit(rows: list[dict]) -> dict | None
    predict(model, row) -> dict | None    # {expected, residual_pct, top_features}
    save(payload), load_or_none()
"""
from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path

import joblib

from . import MODEL_STORE

log = logging.getLogger(__name__)

_PATH = MODEL_STORE / "expected_price.joblib"

# Categorical columns are label-encoded into numeric ids stored in `vocab`.
_NUMERIC = ["days_out", "dow", "month"]
_CATEGORICAL = ["origin", "destination", "cabin_class", "airline_code"]


def _encode(row: dict, vocab: dict) -> list[float]:
    feats = []
    for c in _CATEGORICAL:
        v = row.get(c) or "_unk"
        feats.append(vocab.get(c, {}).get(v, 0))
    for c in _NUMERIC:
        feats.append(float(row.get(c, 0) or 0))
    return feats


def _build_vocab(rows: list[dict]) -> dict:
    vocab = {c: {"_unk": 0} for c in _CATEGORICAL}
    for r in rows:
        for c in _CATEGORICAL:
            v = r.get(c) or "_unk"
            if v not in vocab[c]:
                vocab[c][v] = len(vocab[c])
    return vocab


def fit(rows: list[dict]) -> dict | None:
    """`rows` need: origin, destination, cabin_class, airline_code,
    days_out, dow, month, price (target)."""
    if not rows or len(rows) < 200:
        return None
    try:
        import lightgbm as lgb
    except ImportError as e:
        log.warning("lightgbm missing: %s", e)
        return None

    vocab = _build_vocab(rows)
    X = [_encode(r, vocab) for r in rows]
    y = [float(r.get("price", 0) or 0) for r in rows]

    model = lgb.LGBMRegressor(
        n_estimators=400,
        learning_rate=0.05,
        num_leaves=63,
        min_data_in_leaf=20,
        objective="regression",
        random_state=42,
        verbose=-1,
    )
    model.fit(X, y, categorical_feature=list(range(len(_CATEGORICAL))))

    return {
        "fit_at": datetime.utcnow().isoformat(),
        "n_observations": len(rows),
        "model": model,
        "vocab": vocab,
        "feature_names": _CATEGORICAL + _NUMERIC,
    }


def predict(model: dict, row: dict, top_n: int = 3) -> dict | None:
    if not model or "model" not in model:
        return None
    try:
        x = _encode(row, model["vocab"])
        expected = float(model["model"].predict([x])[0])
        actual = float(row.get("price", 0) or 0)
        residual_pct = ((actual - expected) / expected) if expected else 0.0

        top_features = _shap_top(model, x, top_n)

        return {
            "expected": expected,
            "actual": actual,
            "residual_pct": residual_pct,
            "top_features": top_features,
        }
    except Exception as e:
        log.warning("expected_price predict failed: %s", e)
        return None


def _shap_top(model: dict, x: list[float], top_n: int) -> list[dict]:
    """Return [{feature, value, shap}] sorted by |shap| desc."""
    try:
        import shap
        import numpy as np

        explainer = shap.TreeExplainer(model["model"])
        sv = explainer.shap_values(np.array([x]))
        sv = sv[0] if hasattr(sv, "__len__") else sv

        names = model["feature_names"]
        pairs = sorted(
            ((n, float(v), float(s)) for n, v, s in zip(names, x, sv)),
            key=lambda t: abs(t[2]),
            reverse=True,
        )[:top_n]
        return [{"feature": n, "value": v, "shap": s} for n, v, s in pairs]
    except Exception as e:
        log.debug("shap unavailable: %s", e)
        return []


def save(payload: dict) -> None:
    joblib.dump(payload, _PATH)


def load_or_none() -> dict | None:
    if not _PATH.exists():
        return None
    try:
        return joblib.load(_PATH)
    except Exception as e:
        log.warning("expected_price load failed: %s", e)
        return None
