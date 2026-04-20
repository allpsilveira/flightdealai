"""ML services — Phase 4.

Three modules, all gracefully degrade if model artifacts are missing
(they return None and let the hand-rolled scoring continue).

  forecaster.py     — short-term price forecast (AutoARIMA / ETS)
  anomaly.py        — IsolationForest error-fare detection per (route, cabin)
  expected_price.py — LightGBM expected-price + SHAP feature attributions
"""

from pathlib import Path

# Where trained model artifacts live. Created on first retrain.
MODEL_STORE = Path(__file__).resolve().parent.parent.parent.parent / "ml_models"
MODEL_STORE.mkdir(parents=True, exist_ok=True)
