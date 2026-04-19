import { useEffect, useState } from "react";
import api from "../lib/api";

/**
 * MONITOR-route widget: compares two-one-ways vs round-trip totals.
 * GET /deals/trip-comparison/{routeId}?cabin_class=BUSINESS
 */
export default function TripTypeComparison({ routeId, cabinClass }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!routeId || !cabinClass) return;
    setLoading(true);
    api.get(`/deals/trip-comparison/${routeId}`, { params: { cabin_class: cabinClass } })
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [routeId, cabinClass]);

  if (loading) {
    return (
      <div className="card p-4 animate-pulse">
        <div className="h-3 w-24 bg-zinc-200 dark:bg-zinc-700 rounded mb-3" />
        <div className="h-16 bg-zinc-100 dark:bg-zinc-800 rounded" />
      </div>
    );
  }

  if (!data || data.recommendation === "insufficient_data") {
    return (
      <div className="card p-4">
        <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
          Trip Comparison
        </p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Need both directions scanned to compare. Check back after the next scan.
        </p>
      </div>
    );
  }

  const useOneWays = data.recommendation === "two_one_ways";
  const total      = data.one_way_total;

  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-3">
        Trip Comparison
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className={`rounded-lg p-3 border ${useOneWays
          ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/40"
          : "bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700"}`}>
          <p className="text-2xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">
            Two One-Ways
          </p>
          {total ? (
            <p className="text-lg font-bold text-zinc-900 dark:text-white tabular-nums">
              ${Math.round(total).toLocaleString()}
            </p>
          ) : (
            <p className="text-xs text-zinc-400">—</p>
          )}
          {data.one_way_outbound && data.one_way_inbound && (
            <p className="text-2xs text-zinc-500 dark:text-zinc-400 mt-1 tabular-nums">
              ${Math.round(data.one_way_outbound)} + ${Math.round(data.one_way_inbound)}
            </p>
          )}
        </div>

        <div className={`rounded-lg p-3 border ${!useOneWays && data.round_trip_total
          ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/40"
          : "bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700"}`}>
          <p className="text-2xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">
            Round Trip
          </p>
          {data.round_trip_total ? (
            <p className="text-lg font-bold text-zinc-900 dark:text-white tabular-nums">
              ${Math.round(data.round_trip_total).toLocaleString()}
            </p>
          ) : (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">Not scanned yet</p>
          )}
        </div>
      </div>

      {data.savings != null && (
        <p className={`text-xs font-medium mt-3 ${data.savings > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500"}`}>
          {data.savings > 0
            ? `Save $${Math.round(Math.abs(data.savings)).toLocaleString()} (${data.savings_pct?.toFixed(0)}%) booking as two one-ways`
            : `Round trip is cheaper by $${Math.round(Math.abs(data.savings)).toLocaleString()}`}
        </p>
      )}
    </div>
  );
}
