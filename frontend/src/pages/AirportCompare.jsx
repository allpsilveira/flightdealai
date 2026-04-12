import { useState, useEffect } from "react";
import api from "../lib/api";

const CABIN_LABEL = {
  BUSINESS: "Business",
  FIRST: "First Class",
  PREMIUM_ECONOMY: "Premium Economy",
};

function StatCell({ label, value, highlight }) {
  return (
    <div className={`text-center p-3 rounded-xl ${highlight ? "bg-brand-50 dark:bg-brand-500/10" : "bg-zinc-50 dark:bg-zinc-800"}`}>
      <p className="label mb-1">{label}</p>
      <p className={`text-base font-semibold tabular-nums ${highlight ? "text-brand-500" : "text-zinc-900 dark:text-white"}`}>
        {value != null ? `$${Math.round(value).toLocaleString()}` : "—"}
      </p>
    </div>
  );
}

function SavingsBadge({ savings }) {
  if (!savings || savings <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-500/20">
      Save ${Math.round(savings).toLocaleString()} vs most expensive
    </span>
  );
}

export default function AirportCompare() {
  const [routes,   setRoutes]   = useState([]);
  const [selected, setSelected] = useState(null);
  const [cabin,    setCabin]    = useState("BUSINESS");
  const [data,     setData]     = useState([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    api.get("/routes/").then(r => {
      setRoutes(r.data);
      if (r.data.length > 0) {
        const first = r.data[0];
        setSelected(first.id);
        setCabin(first.cabin_classes[0] ?? "BUSINESS");
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selected || !cabin) return;
    setLoading(true);
    api.get(`/prices/compare/${selected}`, { params: { cabin_class: cabin } })
      .then(r => setData(r.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [selected, cabin]);

  const route = routes.find(r => r.id === selected);

  const maxAvg = data.reduce((m, d) => Math.max(m, d.avg_90d ?? 0), 0);

  const byOrigin = data.reduce((acc, row) => {
    if (!acc[row.origin]) acc[row.origin] = [];
    acc[row.origin].push(row);
    return acc;
  }, {});

  const originSummary = Object.entries(byOrigin).map(([origin, rows]) => {
    const currentPrices = rows.map(r => r.current_price).filter(Boolean);
    const avg30s        = rows.map(r => r.avg_30d).filter(Boolean);
    const avg90s        = rows.map(r => r.avg_90d).filter(Boolean);
    const min90s        = rows.map(r => r.min_90d).filter(Boolean);
    return {
      origin,
      destinations: rows.map(r => r.destination),
      current_price: currentPrices.length ? Math.min(...currentPrices) : null,
      avg_30d:       avg30s.length ? avg30s.reduce((a, b) => a + b, 0) / avg30s.length : null,
      avg_90d:       avg90s.length ? avg90s.reduce((a, b) => a + b, 0) / avg90s.length : null,
      min_90d:       min90s.length ? Math.min(...min90s) : null,
    };
  }).sort((a, b) => (a.avg_90d ?? Infinity) - (b.avg_90d ?? Infinity));

  const bestAvg = originSummary.length > 0 ? originSummary[0] : null;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white tracking-tight">
          Airport Comparison
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Find your best departure airport for each route
        </p>
      </div>

      <div className="flex flex-wrap gap-3 mb-6 p-4 card">
        <div className="flex items-center gap-2">
          <span className="label">Route</span>
          <select className="input py-1.5 text-sm" value={selected ?? ""} onChange={e => {
            const r = routes.find(x => x.id === e.target.value);
            setSelected(e.target.value);
            if (r) setCabin(r.cabin_classes[0] ?? "BUSINESS");
          }}>
            {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>

        {route && (
          <div className="flex items-center gap-2">
            <span className="label">Cabin</span>
            <select className="input py-1.5 text-sm" value={cabin} onChange={e => setCabin(e.target.value)}>
              {route.cabin_classes.map(c => (
                <option key={c} value={c}>{CABIN_LABEL[c]}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="card p-12 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading comparison data…</p>
        </div>
      ) : originSummary.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 mb-4">
            <svg className="w-5 h-5 text-zinc-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="10" cy="10" r="8"/>
              <path d="M10 6v4l3 3"/>
            </svg>
          </div>
          <p className="text-base font-medium text-zinc-900 dark:text-white mb-1">No comparison data yet</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Price data will populate here once scanning starts for this route.
          </p>
        </div>
      ) : (
        <>
          {bestAvg && (
            <div className="card p-5 mb-4 border-l-4 border-brand-500">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Best Value
                    </span>
                  </div>
                  <p className="text-base font-semibold text-zinc-900 dark:text-white">
                    Fly from <span className="text-brand-500">{bestAvg.origin}</span>
                    {bestAvg.destinations.length > 0 && (
                      <span className="text-zinc-500 dark:text-zinc-400 font-normal">
                        {" "}→ {bestAvg.destinations.join(" / ")}
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-white">
                    {bestAvg.avg_90d != null ? `$${Math.round(bestAvg.avg_90d).toLocaleString()}` : "—"}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">90-day average</p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {originSummary.map((airport, i) => {
              const savings = maxAvg - (airport.avg_90d ?? 0);
              const isBest  = i === 0;
              return (
                <div key={airport.origin}
                  className={`card p-5 ${isBest ? "ring-1 ring-brand-500/30" : ""}`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`flex items-center justify-center w-10 h-10 rounded-xl font-bold text-sm ${
                        isBest
                          ? "bg-brand-500 text-white"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                      }`}>
                        {airport.origin}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                          {airport.origin}
                          {isBest && <span className="ml-2 text-xs text-brand-500 font-medium">Best option</span>}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          → {airport.destinations.join(", ")}
                        </p>
                      </div>
                    </div>
                    <SavingsBadge savings={!isBest ? 0 : savings} />
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    <StatCell label="Current"   value={airport.current_price} highlight={isBest} />
                    <StatCell label="30d Avg"   value={airport.avg_30d} />
                    <StatCell label="90d Avg"   value={airport.avg_90d} />
                    <StatCell label="90d Low"   value={airport.min_90d} />
                  </div>

                  {maxAvg > 0 && airport.avg_90d != null && (
                    <div className="mt-4">
                      <div className="flex justify-between text-2xs text-zinc-500 dark:text-zinc-400 mb-1">
                        <span>Price vs corridor average</span>
                        <span>
                          {airport.avg_90d < maxAvg
                            ? `${Math.round(((maxAvg - airport.avg_90d) / maxAvg) * 100)}% cheaper`
                            : "Most expensive"}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${isBest ? "bg-brand-500" : "bg-zinc-300 dark:bg-zinc-600"}`}
                          style={{ width: `${maxAvg > 0 ? Math.round((airport.avg_90d / maxAvg) * 100) : 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {data.length > originSummary.length && (
            <div className="card p-5 mt-4">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-white mb-4">
                All Route Pairs
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-zinc-500 dark:text-zinc-400 border-b border-zinc-100 dark:border-zinc-800">
                      <th className="text-left pb-2 pr-4 font-medium">From</th>
                      <th className="text-left pb-2 pr-4 font-medium">To</th>
                      <th className="text-right pb-2 pr-4 font-medium">Current</th>
                      <th className="text-right pb-2 pr-4 font-medium">30d Avg</th>
                      <th className="text-right pb-2 font-medium">90d Low</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
                    {data.map((row, i) => (
                      <tr key={i} className="text-zinc-700 dark:text-zinc-300">
                        <td className="py-2 pr-4 font-medium">{row.origin}</td>
                        <td className="py-2 pr-4">{row.destination}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {row.current_price != null ? `$${Math.round(row.current_price).toLocaleString()}` : "—"}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {row.avg_30d != null ? `$${Math.round(row.avg_30d).toLocaleString()}` : "—"}
                        </td>
                        <td className="py-2 text-right tabular-nums text-green-600 dark:text-green-400">
                          {row.min_90d != null ? `$${Math.round(row.min_90d).toLocaleString()}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}