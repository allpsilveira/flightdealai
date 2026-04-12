import { useEffect, useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import api from "../lib/api";

function ScanDot({ type }) {
  const base = "w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1";
  if (type === "manual")
    return <div className={`${base} bg-brand-500`} />;
  return <div className={`${base} bg-zinc-400 dark:bg-zinc-600`} />;
}

export default function ActivityTimeline({ routeId }) {
  const [scans,   setScans]   = useState(null);  // null = loading
  const [error,   setError]   = useState(false);

  useEffect(() => {
    if (!routeId) return;
    setScans(null);
    api.get("/scan/history", { params: { route_id: routeId, limit: 20 } })
      .then((r) => setScans(r.data))
      .catch(() => { setScans([]); setError(true); });
  }, [routeId]);

  // Loading
  if (scans === null) {
    return (
      <div className="space-y-4 animate-pulse px-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-200 dark:bg-zinc-700 mt-1 flex-shrink-0" />
            <div className="flex-1 space-y-1.5 pb-4">
              <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded w-1/4" />
              <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded w-3/4" />
              <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Empty
  if (scans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-3">
          <svg className="w-4 h-4 text-zinc-400" viewBox="0 0 16 16" fill="none"
               stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="6"/>
            <path d="M8 5v3.5l2 1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <p className="text-sm font-semibold text-zinc-900 dark:text-white mb-1">No scans yet</p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Click "Scan Now" to run the first scan. Activity will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-[4px] top-2 bottom-2 w-px bg-zinc-100 dark:bg-zinc-800" />

      <div className="space-y-0">
        {scans.map((scan, i) => {
          const ts = new Date(scan.triggered_at);
          const isLast = i === scans.length - 1;

          return (
            <div key={scan.id} className={`flex gap-4 pl-1 ${isLast ? "" : "pb-5"}`}>
              <ScanDot type={scan.trigger_type} />

              <div className="flex-1 min-w-0">
                {/* Timestamp + type */}
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    {formatDistanceToNow(ts, { addSuffix: true })}
                  </span>
                  <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded-full ${
                    scan.trigger_type === "manual"
                      ? "bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                  }`}>
                    {scan.trigger_type === "manual" ? "Manual scan" : "Scheduled"}
                  </span>
                </div>

                {/* Headline */}
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                  {scan.deals_scored > 0
                    ? `${scan.deals_scored} deal${scan.deals_scored !== 1 ? "s" : ""} scored`
                    : "Scan complete — no deals found"}
                  {scan.best_price_usd
                    ? ` · Best $${Math.round(scan.best_price_usd).toLocaleString()}`
                    : ""}
                </p>

                {/* Detail */}
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                  {format(ts, "d MMM yyyy, HH:mm")}
                  {" · "}{scan.origins} → {scan.destinations}
                  {scan.prices_collected > 0
                    ? ` · ${scan.prices_collected} price${scan.prices_collected !== 1 ? "s" : ""} collected`
                    : ""}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
