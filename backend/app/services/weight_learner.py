"""
Scoring weight learner — Phase 6.5.2
Trains a Random Forest classifier on (deal sub-scores → did_drop_10pct label)
and stores learned weights so the scoring engine can use them adaptively.

Why Random Forest, not XGBoost:
  - sklearn is already in requirements.txt (no extra dep)
  - With <10k samples, RF and XGBoost perform similarly
  - feature_importances_ gives us per-feature weights for free

Output:
  Inserts one ScoringWeights row marked is_active=True if AUC >= 0.6,
  otherwise leaves prior active row in place (graceful degradation).
"""
import structlog
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, and_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.deal import DealAnalysis
from app.models.intelligence import DealOutcome, ScoringWeights

logger = structlog.get_logger(__name__)


# Sub-score columns used as model features. Order matters — used to map
# feature_importances_ back to weight names.
FEATURE_COLUMNS = [
    "score_percentile",
    "score_zscore",
    "score_trend_alignment",
    "score_trend_direction",
    "score_cross_source",
    "score_arbitrage",
    "score_fare_brand",
    "score_scarcity",
    "score_award",
]

MIN_SAMPLES = 50            # below this we skip training
MIN_AUC     = 0.6           # below this we keep prior weights
LOOKBACK_DAYS = 90


async def train_and_store_weights(db: AsyncSession) -> dict | None:
    """
    Pull labeled deals from last LOOKBACK_DAYS days, train RF, store weights.
    Returns a summary dict or None if training was skipped.
    """
    # Lazy imports — sklearn/numpy take ~200ms to import
    try:
        import numpy as np
        from sklearn.ensemble import RandomForestClassifier
        from sklearn.metrics import roc_auc_score
        from sklearn.model_selection import train_test_split
    except ImportError as exc:
        logger.warning("weight_learner_sklearn_missing", error=str(exc))
        return None

    cutoff = datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)

    # Join deal_analysis ⨝ deal_outcomes
    stmt = (
        select(DealAnalysis, DealOutcome)
        .join(DealOutcome, DealOutcome.deal_analysis_id == DealAnalysis.id)
        .where(and_(
            DealAnalysis.time >= cutoff,
            DealOutcome.did_drop_10pct.isnot(None),
        ))
    )
    rows = (await db.execute(stmt)).all()

    if len(rows) < MIN_SAMPLES:
        logger.info("weight_learner_insufficient_data", samples=len(rows), required=MIN_SAMPLES)
        return {"skipped": True, "reason": "insufficient_data", "samples": len(rows)}

    X = np.array([
        [getattr(deal, col) or 0.0 for col in FEATURE_COLUMNS]
        for deal, _ in rows
    ])
    y = np.array([1 if outcome.did_drop_10pct else 0 for _, outcome in rows])

    # Need both classes present
    if len(set(y)) < 2:
        logger.info("weight_learner_single_class", n=len(y), class_=int(y[0]))
        return {"skipped": True, "reason": "single_class", "samples": len(rows)}

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=y
    )

    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=8,
        min_samples_leaf=5,
        n_jobs=-1,
        random_state=42,
        class_weight="balanced",
    )
    model.fit(X_train, y_train)
    auc = float(roc_auc_score(y_test, model.predict_proba(X_test)[:, 1]))

    importances = model.feature_importances_
    # Normalize importances → weights centered at 1.0 (mean weight = 1.0)
    if importances.sum() > 0:
        norm = importances / importances.mean()
    else:
        norm = importances + 1.0

    weights = {col: float(round(norm[i], 3)) for i, col in enumerate(FEATURE_COLUMNS)}
    feature_importance = {col: float(round(importances[i], 4)) for i, col in enumerate(FEATURE_COLUMNS)}

    is_active = auc >= MIN_AUC

    # Deactivate any prior active row, then insert new one
    if is_active:
        await db.execute(
            update(ScoringWeights).where(ScoringWeights.is_active == True).values(is_active=False)  # noqa: E712
        )

    new_row = ScoringWeights(
        model_type="random_forest",
        auc=round(auc, 3),
        sample_size=len(rows),
        weights=weights,
        feature_importance=feature_importance,
        is_active=is_active,
        weights_metadata={
            "lookback_days": LOOKBACK_DAYS,
            "n_estimators": 200,
            "max_depth": 8,
            "label": "did_drop_10pct",
            "test_size": 0.25,
        },
    )
    db.add(new_row)
    await db.flush()

    logger.info(
        "weight_learner_trained",
        auc=round(auc, 3),
        samples=len(rows),
        is_active=is_active,
        top_feature=max(feature_importance.items(), key=lambda x: x[1])[0],
    )

    return {
        "auc": round(auc, 3),
        "samples": len(rows),
        "is_active": is_active,
        "weights": weights,
        "feature_importance": feature_importance,
    }


async def get_active_weights(db: AsyncSession) -> dict[str, float]:
    """Return {sub_score_column: weight} for the currently active model, or {} if none."""
    stmt = (
        select(ScoringWeights)
        .where(ScoringWeights.is_active == True)  # noqa: E712
        .order_by(ScoringWeights.trained_at.desc())
        .limit(1)
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    return row.weights if row else {}
