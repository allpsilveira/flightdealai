import { useEffect, useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import api from "../lib/api";

export default function ScanHistory() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    api.get("/scan/history")
      .then(({ data }) => setHistory(data))
      .catch(() => setError("Could not load scan history."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white tracking-tight">
          Scan History
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Every manual and scheduled scan that ran
        </p>
      </div>

      {loading && (
        <p className="text-sm text-zinc-400 dark:text-zinc-500 text-center py-16">Loading…</p>
      )}
      {error && (
        <p className="text-sm text-red-500 text-center py-8">{error}</p>
      )}

      {!loading && history.length === 0 && (
        <div className="card p-12 text-center">
          <p className="text-base font-medium text-zinc-900 dark:text-white mb-1">No scans yet</p>
          <p className="text-sm text-zinc-400 dark:text-zinc-500">
            Go to Routes and hit <span className="font-medium">Scan Now</span> on any route.
          </p>
        </div>
      )}

      {!loading && history.length > 0 && (
        <div className="space-y-2">
          {history.map((scan) => (
            <div key={scan.id} className="card p-4 flex items-center gap-4">
              {/* Status dot */}
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                scan.status === "ok" ? "bg-emerald-500" : "bg-red-500"
              }`} />

              {/* Route summary */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-zinc-900 dark:text-white">
                    {scan.origins} → {scan.destinations}
                  </span>
                  <span className="text-2xs px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800
                                   text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                    {scan.cabin_classes.replace(/,/g, " · ")}
                  </span>
                  <span className="text-2xs px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800
                                   text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                    {scan.trigger_type}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                  <span>{scan.prices_collected} prices collected</span>
                  {scan.deals_scored > 0 && (
                    <>
                      <span className="text-zinc-300 dark:text-zinc-700">·</span>
                      <span className="text-brand-500 font-medium">{scan.deals_scored} deal{scan.deals_scored !== 1 ? "s" : ""} scored</span>
                    </>
                  )}
                  {scan.best_price_usd && (
                    <>
                      <span className="text-zinc-300 dark:text-zinc-700">·</span>
                      <span>
                        Best <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                          ${scan.best_price_usd.toLocaleString()}
                        </span>
                        {" "}{scan.best_origin}→{scan.best_destination}
                        {" "}{scan.best_cabin?.replace("_", " ")}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Timestamp */}
              <div className="text-right flex-shrink-0">
                <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                  {formatDistanceToNow(new Date(scan.triggered_at), { addSuffix: true })}
                </p>
                <p className="text-2xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                  {format(new Date(scan.triggered_at), "d MMM · HH:mm")}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
