import { useEffect, useRef } from "react";
import { useDealsStore } from "../stores/useDeals";
import { useAuthStore } from "../stores/useAuth";
import DealCard from "../components/DealCard";

const CABIN_OPTIONS = ["BUSINESS", "FIRST", "PREMIUM_ECONOMY"];
const ACTION_OPTIONS = ["STRONG_BUY", "BUY", "WATCH"];

export default function Dashboard() {
  const { deals, loading, error, filters, setFilter, fetchDeals, addLiveDeal } = useDealsStore();
  const accessToken = useAuthStore((s) => s.accessToken);
  const wsRef = useRef(null);

  useEffect(() => { fetchDeals(); }, [filters]);

  useEffect(() => {
    if (!accessToken) return;
    const wsUrl = `${import.meta.env.VITE_WS_URL ?? "ws://localhost/ws"}/deals?token=${accessToken}`;
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.event === "deal_update") addLiveDeal(msg.data);
    };
    ws.onopen  = () => { wsRef.current = setInterval(() => ws.send("ping"), 25_000); };
    ws.onclose = () => { clearInterval(wsRef.current); };
    return () => { clearInterval(wsRef.current); ws.close(); };
  }, [accessToken]);

  return (
    <div className="p-8 max-w-7xl mx-auto">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white tracking-tight">
          Deal Feed
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Live-scored Business &amp; First class opportunities
        </p>
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-6 p-4 card">
        <span className="label">Filters</span>

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Min score</span>
          <input
            type="number" min="0" max="170"
            value={filters.minScore}
            onChange={(e) => setFilter("minScore", Number(e.target.value))}
            className="input w-20 py-1.5 text-center text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Cabin</span>
          <select
            value={filters.cabinClass ?? ""}
            onChange={(e) => setFilter("cabinClass", e.target.value || null)}
            className="input py-1.5 text-sm"
          >
            <option value="">All</option>
            {CABIN_OPTIONS.map((c) => (
              <option key={c} value={c}>{c.replace("_", " ")}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Action</span>
          <select
            value={filters.action ?? ""}
            onChange={(e) => setFilter("action", e.target.value || null)}
            className="input py-1.5 text-sm"
          >
            <option value="">All</option>
            {ACTION_OPTIONS.map((a) => (
              <option key={a} value={a}>{a.replace("_", " ")}</option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={filters.gemsOnly}
            onChange={(e) => setFilter("gemsOnly", e.target.checked)}
            className="rounded accent-brand-500 border-zinc-300 dark:border-zinc-600"
          />
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">GEMs only</span>
        </label>
      </div>

      {/* ── States ──────────────────────────────────────────────────────── */}
      {loading && (
        <div className="text-center py-20 text-zinc-400 dark:text-zinc-500 text-sm">
          Loading deals…
        </div>
      )}
      {error && (
        <div className="text-center py-12 text-red-500 text-sm">{error}</div>
      )}
      {!loading && deals.length === 0 && (
        <div className="text-center py-24">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl
                          bg-zinc-100 dark:bg-zinc-800 mb-4">
            <svg className="w-5 h-5 text-zinc-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 17L10 3L17 17M7 13h6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p className="text-base font-medium text-zinc-900 dark:text-white mb-1">No deals yet</p>
          <p className="text-sm text-zinc-400 dark:text-zinc-500">
            Add a route and the scanner will populate this feed.
          </p>
        </div>
      )}

      {/* ── Grid ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} />
        ))}
      </div>
    </div>
  );
}
