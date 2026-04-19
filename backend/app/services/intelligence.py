"""
Data science intelligence layer — the brain of FlyLuxuryDeals.

Functions:
  - classify_price_regime: GMM clusters prices into sale/normal/peak/error regimes
  - detect_price_cycles: autocorrelation finds dominant price cycle period
  - forecast_prices: linear regression + day-of-week seasonal forecasting
  - find_similar_patterns: KNN on price-window features to predict outcomes
  - compute_route_correlations: Pearson correlation between route price series
  - analyze_dow_pattern: day-of-week price patterns ("book on Tuesdays")
  - analyze_lead_time: optimal booking lead-time analysis
  - run_intelligence: orchestrator — runs all of the above for a route

All functions degrade gracefully — if data is insufficient they return None
rather than raising. Logged via structlog for observability.
"""
import structlog
from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import numpy as np
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.intelligence import PricePrediction, PriceRegime

logger = structlog.get_logger(__name__)


# ════════════════════════════════════════════════════════════════════════════
# Helper: load price history
# ════════════════════════════════════════════════════════════════════════════

async def _load_daily_min_prices(
    db: AsyncSession,
    route_id: UUID,
    origin: str,
    destination: str,
    cabin_class: str,
    days: int = 90,
) -> tuple[list[date], list[float]]:
    """Returns (dates, prices) for the last N days, ordered chronologically."""
    result = await db.execute(
        text("""
            SELECT bucket::date AS day, MIN(min_price)::float AS price
            FROM price_daily_stats
            WHERE route_id = :route_id
              AND origin = :origin
              AND destination = :destination
              AND cabin_class = :cabin_class
              AND bucket >= NOW() - make_interval(days => :days)
            GROUP BY day
            ORDER BY day
        """),
        {
            "route_id": str(route_id),
            "origin": origin,
            "destination": destination,
            "cabin_class": cabin_class,
            "days": days,
        },
    )
    rows = result.mappings().all()
    return [r["day"] for r in rows], [float(r["price"]) for r in rows]


# ════════════════════════════════════════════════════════════════════════════
# 1. Price Regime Classifier (GMM)
# ════════════════════════════════════════════════════════════════════════════

def classify_price_regime(prices: list[float]) -> dict[str, Any] | None:
    """
    Fit a 3-component Gaussian Mixture Model on price history. Components are
    relabeled by mean: lowest=sale, middle=normal, highest=peak.
    If the most recent price is < sale_mean - 2σ, classify as 'error'.

    Returns dict with: regime, probability, threshold_low, threshold_high,
    sale_mean, normal_mean, peak_mean, sample_size.
    Returns None if <30 data points.
    """
    if len(prices) < 30:
        return None

    try:
        from sklearn.mixture import GaussianMixture
    except ImportError:
        logger.warning("sklearn_not_installed")
        return None

    arr = np.array(prices, dtype=float).reshape(-1, 1)
    try:
        gmm = GaussianMixture(n_components=3, random_state=42, n_init=3)
        gmm.fit(arr)
    except Exception as exc:
        logger.warning("gmm_fit_failed", error=str(exc))
        return None

    means = gmm.means_.flatten()
    stds = np.sqrt(gmm.covariances_.flatten())

    # Sort components by mean: 0=sale, 1=normal, 2=peak
    order = np.argsort(means)
    sale_mean, normal_mean, peak_mean = means[order]
    sale_std = stds[order[0]]

    current = prices[-1]
    proba = gmm.predict_proba(np.array([[current]]))[0]

    # Detect error fare: well below sale mean
    if current < sale_mean - 2.0 * sale_std:
        regime, probability = "error", min(0.99, float(2.0 - (current - (sale_mean - 2.0 * sale_std)) / max(sale_std, 1.0)))
    else:
        # Map original component index → label via 'order' position
        comp_idx = int(np.argmax(proba))
        position = int(np.where(order == comp_idx)[0][0])
        regime = ["sale", "normal", "peak"][position]
        probability = float(proba[comp_idx])

    return {
        "regime": regime,
        "probability": probability,
        "threshold_low": float(sale_mean),
        "threshold_high": float(peak_mean),
        "sale_mean": float(sale_mean),
        "normal_mean": float(normal_mean),
        "peak_mean": float(peak_mean),
        "current_price": float(current),
        "sample_size": len(prices),
    }


# ════════════════════════════════════════════════════════════════════════════
# 2. Price Cycle Detector (Autocorrelation)
# ════════════════════════════════════════════════════════════════════════════

def detect_price_cycles(
    prices: list[float],
    dates: list[date],
    min_cycle: int = 7,
    max_cycle: int = 90,
) -> dict[str, Any] | None:
    """
    Compute autocorrelation on detrended price series. Find the dominant cycle
    in [min_cycle, max_cycle] day range. Returns next predicted low estimate.
    """
    if len(prices) < 60:
        return None

    arr = np.array(prices, dtype=float)
    # Detrend (remove linear trend)
    x = np.arange(len(arr))
    coef = np.polyfit(x, arr, 1)
    detrended = arr - (coef[0] * x + coef[1])

    # Normalize
    detrended = detrended - detrended.mean()
    if detrended.std() == 0:
        return None
    detrended = detrended / detrended.std()

    # Autocorrelation via FFT for efficiency
    n = len(detrended)
    f = np.fft.fft(detrended, n=2 * n)
    acf = np.fft.ifft(f * np.conj(f))[:n].real
    acf = acf / acf[0]  # normalize

    # Find peak in [min_cycle, max_cycle]
    valid_range = acf[min_cycle:min(max_cycle, n)]
    if len(valid_range) == 0:
        return None
    peak_offset = int(np.argmax(valid_range))
    cycle_days = min_cycle + peak_offset
    confidence = float(valid_range[peak_offset])

    # Only report meaningful cycles
    if confidence < 0.2:
        return None

    # Find last local minimum in price series
    last_low_idx = int(np.argmin(arr[-cycle_days:])) + (len(arr) - cycle_days)
    last_low_date = dates[last_low_idx]
    next_low_estimate = last_low_date + timedelta(days=cycle_days)

    return {
        "cycle_days": cycle_days,
        "confidence": confidence,
        "last_low_date": last_low_date.isoformat(),
        "last_low_price": float(arr[last_low_idx]),
        "next_low_estimate": next_low_estimate.isoformat(),
        "sample_size": len(prices),
    }


# ════════════════════════════════════════════════════════════════════════════
# 3. Price Forecaster (Linear + Seasonal)
# ════════════════════════════════════════════════════════════════════════════

def forecast_prices(
    prices: list[float],
    dates: list[date],
    horizon_days: int = 14,
) -> dict[str, Any] | None:
    """
    Linear trend + day-of-week seasonal adjustment + 95% confidence band.
    Returns horizon-many forecasts with conf_low/conf_high per day.
    """
    if len(prices) < 14:
        return None

    try:
        from scipy import stats as sstats
    except ImportError:
        logger.warning("scipy_not_installed")
        return None

    arr = np.array(prices, dtype=float)
    x = np.arange(len(arr))

    # Linear trend
    slope, intercept, r_value, _, _ = sstats.linregress(x, arr)
    trend_fit = slope * x + intercept
    residuals = arr - trend_fit

    # Day-of-week seasonal adjustment
    dow_means = {}
    for i, d in enumerate(dates):
        dow = d.weekday()
        dow_means.setdefault(dow, []).append(residuals[i])
    dow_adj = {dow: float(np.mean(vals)) for dow, vals in dow_means.items()}

    # Confidence band from residual std
    resid_std = float(np.std(residuals)) if len(residuals) > 1 else 0.0
    z = 1.96  # 95%

    # Project forward
    forecasts = []
    last_date = dates[-1]
    for h in range(1, horizon_days + 1):
        future_date = last_date + timedelta(days=h)
        future_x = len(arr) + h - 1
        trend_value = slope * future_x + intercept
        seasonal = dow_adj.get(future_date.weekday(), 0.0)
        predicted = max(0.0, trend_value + seasonal)
        forecasts.append({
            "date": future_date.isoformat(),
            "predicted": float(predicted),
            "conf_low": float(max(0.0, predicted - z * resid_std)),
            "conf_high": float(predicted + z * resid_std),
        })

    return {
        "forecasts": forecasts,
        "trend_direction": "falling" if slope < -0.5 else "rising" if slope > 0.5 else "stable",
        "daily_change_usd": float(slope),
        "r_squared": float(r_value ** 2),
        "residual_std": resid_std,
        "sample_size": len(prices),
    }


# ════════════════════════════════════════════════════════════════════════════
# 4. Pattern Matcher (KNN on price windows)
# ════════════════════════════════════════════════════════════════════════════

def _window_features(window: list[float]) -> np.ndarray:
    arr = np.array(window, dtype=float)
    if len(arr) < 2 or arr.std() == 0:
        return np.array([0.0, 0.0, 0.0, 0.0, 0.0])
    x = np.arange(len(arr))
    slope = float(np.polyfit(x, arr, 1)[0])
    volatility = float(arr.std())
    mean = float(arr.mean())
    level_vs_mean = float(arr[-1] / mean) if mean else 1.0
    min_position = float(np.argmin(arr) / max(len(arr) - 1, 1))
    max_position = float(np.argmax(arr) / max(len(arr) - 1, 1))
    return np.array([slope, volatility, level_vs_mean, min_position, max_position])


def find_similar_patterns(
    prices: list[float],
    dates: list[date],
    window_size: int = 14,
    forward: int = 7,
    k: int = 5,
) -> dict[str, Any] | None:
    """
    Compare the most-recent window against all historical windows of the same
    size. Find the K nearest by Euclidean distance on engineered features.
    For each match, report what happened in the forward-many days after.
    """
    if len(prices) < window_size + forward + 5:
        return None

    current = _window_features(prices[-window_size:])
    matches = []

    # Slide through history (excluding the most recent window)
    for i in range(0, len(prices) - window_size - forward):
        hist_window = prices[i:i + window_size]
        feat = _window_features(hist_window)
        dist = float(np.linalg.norm(current - feat))

        # What happened next
        future_window = prices[i + window_size:i + window_size + forward]
        if not future_window:
            continue
        end_price = hist_window[-1]
        min_future = min(future_window)
        outcome_pct = ((min_future - end_price) / end_price * 100.0) if end_price else 0.0

        matches.append({
            "start_date": dates[i].isoformat(),
            "similarity": float(1.0 / (1.0 + dist)),
            "outcome_pct": float(outcome_pct),
            "min_future_price": float(min_future),
        })

    if not matches:
        return None

    # Top-K by similarity
    matches.sort(key=lambda m: -m["similarity"])
    top = matches[:k]

    outcomes = [m["outcome_pct"] for m in top]
    drops = [o for o in outcomes if o <= -5.0]
    rises = [o for o in outcomes if o >= 5.0]

    if len(drops) >= len(top) * 0.6:
        consensus = f"{len(drops)} of {len(top)} similar patterns dropped (median {float(np.median(drops)):.0f}%)"
    elif len(rises) >= len(top) * 0.6:
        consensus = f"{len(rises)} of {len(top)} similar patterns rose (median {float(np.median(rises)):.0f}%)"
    else:
        consensus = f"Mixed: {len(top)} similar patterns showed varied outcomes"

    return {
        "matches": top,
        "consensus": consensus,
        "avg_outcome_pct": float(np.mean(outcomes)),
        "median_outcome_pct": float(np.median(outcomes)),
    }


# ════════════════════════════════════════════════════════════════════════════
# 5. Cross-Route Correlator
# ════════════════════════════════════════════════════════════════════════════

async def compute_route_correlations(
    db: AsyncSession,
    route_id: UUID,
    user_id: UUID,
    days: int = 60,
    min_overlap: int = 30,
) -> list[dict[str, Any]]:
    """
    For each other route owned by the same user, compute Pearson correlation
    on daily min prices. Returns sorted by |correlation| desc.
    """
    result = await db.execute(
        text("""
            SELECT
                r.id AS route_id, r.name AS route_name,
                pds.bucket::date AS day,
                MIN(pds.min_price) AS price
            FROM routes r
            JOIN price_daily_stats pds ON pds.route_id = r.id
            WHERE r.user_id = :user_id
              AND pds.bucket >= NOW() - make_interval(days => :days)
            GROUP BY r.id, r.name, day
            ORDER BY r.id, day
        """),
        {"user_id": str(user_id), "days": days},
    )
    rows = result.mappings().all()

    # Build series per route
    series: dict[str, dict[date, float]] = {}
    names: dict[str, str] = {}
    for r in rows:
        rid = str(r["route_id"])
        series.setdefault(rid, {})[r["day"]] = float(r["price"])
        names[rid] = r["route_name"]

    target_id = str(route_id)
    if target_id not in series:
        return []

    target = series[target_id]
    correlations = []
    for other_id, other_series in series.items():
        if other_id == target_id:
            continue
        common_days = sorted(set(target.keys()) & set(other_series.keys()))
        if len(common_days) < min_overlap:
            continue
        a = np.array([target[d] for d in common_days])
        b = np.array([other_series[d] for d in common_days])
        if a.std() == 0 or b.std() == 0:
            continue
        corr = float(np.corrcoef(a, b)[0, 1])
        correlations.append({
            "route_id": other_id,
            "route_name": names[other_id],
            "correlation": corr,
            "overlap_days": len(common_days),
        })

    correlations.sort(key=lambda c: -abs(c["correlation"]))
    return correlations


# ════════════════════════════════════════════════════════════════════════════
# 6. Day-of-week pattern (Phase 8)
# ════════════════════════════════════════════════════════════════════════════

def analyze_dow_pattern(prices: list[float], dates: list[date]) -> dict[str, Any] | None:
    if len(prices) < 21:
        return None
    by_dow: dict[int, list[float]] = {}
    for p, d in zip(prices, dates):
        by_dow.setdefault(d.weekday(), []).append(p)
    if not by_dow:
        return None
    avg_overall = float(np.mean(prices))
    dow_avg = {dow: float(np.mean(vals)) for dow, vals in by_dow.items() if len(vals) >= 2}
    if not dow_avg:
        return None
    cheapest = min(dow_avg, key=dow_avg.get)
    expensive = max(dow_avg, key=dow_avg.get)
    cheapest_pct = (dow_avg[cheapest] - avg_overall) / avg_overall * 100.0
    names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    return {
        "cheapest_dow": names[cheapest],
        "cheapest_pct_below_avg": float(cheapest_pct),
        "most_expensive_dow": names[expensive],
        "by_dow": {names[k]: v for k, v in dow_avg.items()},
    }


# ════════════════════════════════════════════════════════════════════════════
# 7. Lead-time analysis (Phase 8)
# ════════════════════════════════════════════════════════════════════════════

async def analyze_lead_time(
    db: AsyncSession,
    route_id: UUID,
    cabin_class: str,
) -> dict[str, Any] | None:
    """
    For all historical deals on this route+cabin, find the lead time
    (days_to_departure) at which the lowest prices typically occur.
    """
    result = await db.execute(
        text("""
            SELECT
                (departure_date - time::date) AS lead_time,
                best_price_usd AS price
            FROM deal_analysis
            WHERE route_id = :route_id AND cabin_class = :cabin
              AND departure_date > time::date
              AND time >= NOW() - INTERVAL '180 days'
        """),
        {"route_id": str(route_id), "cabin": cabin_class},
    )
    rows = result.mappings().all()
    if len(rows) < 20:
        return None

    leads = np.array([r["lead_time"] for r in rows])
    prices = np.array([float(r["price"]) for r in rows])

    # Bucket by lead-time ranges and find cheapest bucket
    buckets = [(0, 14), (14, 28), (28, 45), (45, 63), (63, 90), (90, 180)]
    bucket_avgs = {}
    for low, high in buckets:
        mask = (leads >= low) & (leads < high)
        if mask.sum() >= 3:
            bucket_avgs[f"{low}-{high}"] = float(prices[mask].mean())
    if not bucket_avgs:
        return None
    cheapest_bucket = min(bucket_avgs, key=bucket_avgs.get)
    return {
        "optimal_lead_days": cheapest_bucket,
        "by_bucket": bucket_avgs,
        "sample_size": len(rows),
    }


# ════════════════════════════════════════════════════════════════════════════
# 8. Buy/Wait Verdict (Phase 8)
# ════════════════════════════════════════════════════════════════════════════

def compute_verdict(
    regime: dict[str, Any] | None,
    forecast: dict[str, Any] | None,
    seats_remaining: int | None = None,
    is_error_fare: bool = False,
) -> dict[str, Any]:
    """Single human verdict combining regime + forecast + scarcity."""
    if is_error_fare:
        return {"verdict": "URGENT", "confidence": 0.95, "reason": "Possible error fare — book within hours"}

    if regime and regime.get("regime") == "sale" and seats_remaining and seats_remaining <= 3:
        return {"verdict": "URGENT", "confidence": 0.85, "reason": f"Sale regime with only {seats_remaining} seats"}

    if regime and regime.get("regime") in ("sale", "error"):
        if forecast:
            min_pred = min(f["predicted"] for f in forecast["forecasts"])
            current = regime.get("current_price", 0)
            if current and min_pred < current * 0.95:
                return {"verdict": "WAIT", "confidence": float(regime["probability"]),
                        "reason": f"Predicted to drop ~{(1 - min_pred/current)*100:.0f}% in next 14 days"}
        return {"verdict": "BUY_NOW", "confidence": float(regime["probability"]),
                "reason": f"In sale regime ({regime['probability']:.0%} confidence)"}

    if regime and regime.get("regime") == "peak":
        return {"verdict": "WAIT", "confidence": float(regime["probability"]),
                "reason": "Currently in peak pricing regime"}

    if forecast:
        if forecast["trend_direction"] == "falling":
            return {"verdict": "WAIT", "confidence": 0.65, "reason": f"Trend ${forecast['daily_change_usd']:+.0f}/day"}
        if forecast["trend_direction"] == "rising":
            return {"verdict": "BUY_NOW", "confidence": 0.65, "reason": f"Trend ${forecast['daily_change_usd']:+.0f}/day"}

    return {"verdict": "MONITOR", "confidence": 0.5, "reason": "Insufficient signal — keep watching"}


# ════════════════════════════════════════════════════════════════════════════
# 9. Orchestrator
# ════════════════════════════════════════════════════════════════════════════

async def run_intelligence(
    db: AsyncSession,
    route_id: UUID,
    origin: str,
    destination: str,
    cabin_class: str,
    user_id: UUID | None = None,
    persist: bool = True,
) -> dict[str, Any]:
    """
    Run all intelligence functions for a (route, od, cabin) combo.
    Returns combined dict with regime, cycle, forecast, patterns, dow, lead_time, verdict.
    Optionally persists regime + predictions to DB.
    """
    dates, prices = await _load_daily_min_prices(db, route_id, origin, destination, cabin_class, days=180)

    regime = classify_price_regime(prices)
    cycle = detect_price_cycles(prices, dates)
    forecast = forecast_prices(prices, dates, horizon_days=14)
    patterns = find_similar_patterns(prices, dates)
    dow = analyze_dow_pattern(prices, dates)
    lead_time = await analyze_lead_time(db, route_id, cabin_class)
    correlations = await compute_route_correlations(db, route_id, user_id) if user_id else []
    verdict = compute_verdict(regime, forecast)

    # Persist
    if persist:
        try:
            if regime:
                db.add(PriceRegime(
                    route_id=route_id,
                    origin=origin,
                    destination=destination,
                    cabin_class=cabin_class,
                    regime_label=regime["regime"],
                    regime_probability=regime["probability"],
                    price_threshold_low=regime["threshold_low"],
                    price_threshold_high=regime["threshold_high"],
                    sample_size=regime["sample_size"],
                    regime_metadata={
                        "sale_mean": regime["sale_mean"],
                        "normal_mean": regime["normal_mean"],
                        "peak_mean": regime["peak_mean"],
                    },
                ))
            if forecast:
                today = date.today()
                for f in forecast["forecasts"]:
                    target = date.fromisoformat(f["date"])
                    db.add(PricePrediction(
                        route_id=route_id,
                        origin=origin,
                        destination=destination,
                        cabin_class=cabin_class,
                        target_date=target,
                        horizon_days=(target - today).days,
                        predicted_price=f["predicted"],
                        confidence_low=f["conf_low"],
                        confidence_high=f["conf_high"],
                        model_type="linear_seasonal",
                        prediction_metadata={"trend_direction": forecast["trend_direction"],
                                             "r_squared": forecast["r_squared"]},
                    ))
            await db.commit()
        except Exception as exc:
            await db.rollback()
            logger.warning("intelligence_persist_failed", error=str(exc))

    return {
        "regime": regime,
        "cycle": cycle,
        "forecast": forecast,
        "patterns": patterns,
        "day_of_week": dow,
        "lead_time": lead_time,
        "correlations": correlations[:5],  # top 5
        "verdict": verdict,
        "data_points": len(prices),
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }
