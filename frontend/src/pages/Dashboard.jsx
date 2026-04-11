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

  useEffect(() => {
    fetchDeals();
  }, [filters]);

  // WebSocket live feed
  useEffect(() => {
    if (!accessToken) return;
    const wsUrl = `${import.meta.env.VITE_WS_URL ?? "ws://localhost/ws"}/deals?token=${accessToken}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.event === "deal_update") addLiveDeal(msg.data);
    };

    ws.onopen = () => {
      // Keep-alive ping every 25s
      wsRef.current = setInterval(() => ws.send("ping"), 25_000);
    };

    ws.onclose = () => {
      clearInterval(wsRef.current);
    };

    return () => {
      clearInterval(wsRef.current);
      ws.close();
    };
  }, [accessToken]);

  return (
    <div className="p-8">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h2 className="font-serif text-3xl font-light text-white mb-1">Deal Feed</h2>
        <p className="text-sm text-white/40 font-sans">
          Live-scored opportunities across all monitored routes
        </p>
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 mb-8 p-4 card">
        {/* Min score */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40 font-sans uppercase tracking-wider">Min score</span>
          <input
            type="number"
            min="0"
            max="170"
            value={filters.minScore}
            onChange={(e) => setFilter("minScore", Number(e.target.value))}
            className="input w-20 py-1.5 text-center"
          />
        </div>

        {/* Cabin */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40 font-sans uppercase tracking-wider">Cabin</span>
          <select
            value={filters.cabinClass ?? ""}
            onChange={(e) => setFilter("cabinClass", e.target.value || null)}
            className="input py-1.5"
          >
            <option value="">All</option>
            {CABIN_OPTIONS.map((c) => (
              <option key={c} value={c}>{c.replace("_", " ")}</option>
            ))}
          </select>
        </div>

        {/* Action */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40 font-sans uppercase tracking-wider">Action</span>
          <select
            value={filters.action ?? ""}
            onChange={(e) => setFilter("action", e.target.value || null)}
            className="input py-1.5"
          >
            <option value="">All</option>
            {ACTION_OPTIONS.map((a) => (
              <option key={a} value={a}>{a.replace("_", " ")}</option>
            ))}
          </select>
        </div>

        {/* Gems only */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.gemsOnly}
            onChange={(e) => setFilter("gemsOnly", e.target.checked)}
            className="rounded border-surface-border bg-surface accent-gold-500"
          />
          <span className="text-xs font-sans text-white/60">GEMs only ✦</span>
        </label>
      </div>

      {/* ── Deal grid ────────────────────────────────────────────────────── */}
      {loading && (
        <div className="text-center py-20 text-white/30 font-sans text-sm">
          Loading deals…
        </div>
      )}

      {error && (
        <div className="text-center py-12 text-red-400 font-sans text-sm">
          {error}
        </div>
      )}

      {!loading && deals.length === 0 && (
        <div className="text-center py-20">
          <p className="font-serif text-xl font-light text-white/30 mb-2">No deals yet</p>
          <p className="text-sm font-sans text-white/20">
            Add a route and the scanner will populate this feed automatically.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} />
        ))}
      </div>
    </div>
  );
}
