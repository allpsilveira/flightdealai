import { useEffect, useState } from "react";
import api from "../lib/api";
import { VERDICT_COLORS, REGIME_COLORS } from "../lib/colors";

const REGIME_LABEL = {
  sale:   "Sale Window",
  normal: "Normal",
  peak:   "Peak Pricing",
  error:  "Error Fare",
};

const VERDICT_LABEL = {
  BUY_NOW:  "Buy Now",
  URGENT:   "Urgent",
  WAIT:     "Wait",
  MONITOR:  "Keep Monitoring",
};

function StatRow({ label, value, sublabel }) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
      <div className="text-right">
        <span className="text-sm font-semibold text-zinc-900 dark:text-white tabular-nums">{value}</span>
        {sublabel && <span className="block text-2xs text-zinc-400 dark:text-zinc-500">{sublabel}</span>}
      </div>
    </div>
  );
}

/**
 * Data-science panel: regime, cycle, forecast, day-of-week, lead-time, verdict.
 * Pulls /api/intelligence/{routeId}?cabin_class=&origin=&destination=
 */
export default function IntelligencePanel({ routeId, cabinClass, origin, destination }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!routeId || !cabinClass) return;
    setLoading(true);
    setError(null);
    const params = { cabin_class: cabinClass };
    if (origin)      params.origin = origin;
    if (destination) params.destination = destination;

    api.get(`/intelligence/${routeId}`, { params })
      .then((r) => setData(r.data))
      .catch((e) => {
        setError(e?.response?.data?.detail || "Intelligence unavailable");
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [routeId, cabinClass, origin, destination]);

  if (loading) {
    return (
      <div className="card p-4 animate-pulse">
        <div className="h-3 w-32 bg-zinc-200 dark:bg-zinc-700 rounded mb-3" />
        <div className="h-24 bg-zinc-100 dark:bg-zinc-800 rounded" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">
          Intelligence
        </p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          {error || "Need at least 30 days of price data — check back soon."}
        </p>
      </div>
    );
  }

  const regime   = data.regime;
  const verdict  = data.verdict;
  const cycle    = data.cycle;
  const forecast = data.forecast;
  const dow      = data.dow_pattern;
  const lead     = data.lead_time;

  const verdictCfg = VERDICT_COLORS?.[verdict?.label] ?? { bg: "bg-zinc-500", text: "text-white" };
  const regimeCfg  = REGIME_COLORS?.[regime?.label]   ?? { bg: "bg-zinc-200 dark:bg-zinc-700", text: "text-zinc-700 dark:text-zinc-200" };

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Intelligence
        </p>
        {regime?.label && (
          <span className={`text-2xs font-bold uppercase px-2 py-0.5 rounded-full ${regimeCfg.bg} ${regimeCfg.text}`}>
            {REGIME_LABEL[regime.label] ?? regime.label}
          </span>
        )}
      </div>

      {/* Verdict */}
      {verdict?.label && (
        <div className={`rounded-lg p-3 ${verdictCfg.bg} ${verdictCfg.text}`}>
          <p className="text-2xs font-bold uppercase tracking-widest opacity-80 mb-0.5">Recommendation</p>
          <p className="text-base font-bold leading-snug">{VERDICT_LABEL[verdict.label] ?? verdict.label}</p>
          {verdict.reason && <p className="text-2xs mt-1 opacity-90">{verdict.reason}</p>}
        </div>
      )}

      {/* Forecast */}
      {forecast?.predicted_price != null && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3">
          <p className="text-2xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">
            14-day forecast
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-zinc-900 dark:text-white tabular-nums">
              ${Math.round(forecast.predicted_price).toLocaleString()}
            </span>
            {forecast.confidence_low != null && forecast.confidence_high != null && (
              <span className="text-2xs text-zinc-400 dark:text-zinc-500 tabular-nums">
                CI ${Math.round(forecast.confidence_low).toLocaleString()}–${Math.round(forecast.confidence_high).toLocaleString()}
              </span>
            )}
          </div>
          {forecast.trend_pct_per_day != null && (
            <p className="text-2xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Trending {forecast.trend_pct_per_day > 0 ? "+" : ""}{forecast.trend_pct_per_day.toFixed(2)}% / day
            </p>
          )}
        </div>
      )}

      {/* Cycle */}
      {cycle?.dominant_period_days && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3">
          <p className="text-2xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">
            Price Cycle
          </p>
          <StatRow
            label="Cycle length"
            value={`~${cycle.dominant_period_days} days`}
            sublabel={cycle.next_cycle_low_estimate ? `Next low ≈ $${Math.round(cycle.next_cycle_low_estimate).toLocaleString()}` : null}
          />
        </div>
      )}

      {/* Day-of-week */}
      {dow?.cheapest_day && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3">
          <StatRow
            label="Cheapest weekday"
            value={dow.cheapest_day}
            sublabel={dow.savings_vs_avg_pct ? `${dow.savings_vs_avg_pct.toFixed(0)}% below avg` : null}
          />
        </div>
      )}

      {/* Lead time */}
      {lead?.optimal_lead_days != null && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3">
          <StatRow
            label="Optimal lead time"
            value={`${lead.optimal_lead_days} days out`}
            sublabel={lead.observation ?? null}
          />
        </div>
      )}
    </div>
  );
}
