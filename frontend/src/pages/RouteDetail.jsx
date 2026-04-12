import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { formatDistanceToNow, format } from "date-fns";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import { parseISO } from "date-fns";
import api from "../lib/api";
import { useRoutesStore } from "../stores/useRoutes";
import ActivityTimeline from "../components/ActivityTimeline";
import AirlineLeaderboard from "../components/AirlineLeaderboard";
import TicketDetailPanel from "../components/TicketDetailPanel";

const CABIN_LABEL = {
  BUSINESS: "Business",
  FIRST: "First Class",
  PREMIUM_ECONOMY: "Premium Economy",
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 text-xs font-sans shadow-lg">
      <p className="text-zinc-500 dark:text-zinc-400 mb-1">
        {label ? (() => { try { return format(parseISO(label), "d MMM yyyy"); } catch { return label; } })() : ""}
      </p>
      {payload.map((p) => (
        <p key={p.name} className="font-medium" style={{ color: p.color }}>
          {p.name}: ${Math.round(p.value).toLocaleString()}
        </p>
      ))}
    </div>
  );
};

export default function RouteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { routes, scanning, scanMeta, fetchRoutes, scanRoute } = useRoutesStore();

  const [deals,          setDeals]          = useState([]);
  const [bestOffers,     setBestOffers]      = useState([]);
  const [priceHistory,   setPriceHistory]    = useState([]);
  const [historyDays,    setHistoryDays]     = useState(30);
  const [historyLoading, setHistoryLoading]  = useState(false);
  const [selectedDeal,   setSelectedDeal]    = useState(null);
  const [cabinFilter,    setCabinFilter]     = useState(null);
  const [deleting,       setDeleting]        = useState(false);

  const route = routes.find((r) => r.id === id) ?? null;

  // Load routes if not yet fetched
  useEffect(() => {
    if (routes.length === 0) fetchRoutes();
  }, []);

  // Load deals for this route
  useEffect(() => {
    if (!id) return;
    api.get("/deals/", { params: { route_id: id, limit: 50 } })
      .then((r) => setDeals(r.data))
      .catch(() => setDeals([]));
  }, [id]);

  // Load per-airline flight offers for the best deal (powers AirlineLeaderboard)
  useEffect(() => {
    const visible = cabinFilter ? deals.filter((d) => d.cabin_class === cabinFilter) : deals;
    const best = visible[0] ?? null;
    if (!best) { setBestOffers([]); return; }
    api.get(`/deals/${best.id}/offers`)
      .then((r) => setBestOffers(r.data))
      .catch(() => setBestOffers([]));
  }, [deals, cabinFilter]);

  // Load price history
  useEffect(() => {
    if (!id || !route) return;
    const origin  = route.origins[0];
    const dest    = route.destinations[0];
    const cabin   = cabinFilter ?? route.cabin_classes[0] ?? "BUSINESS";
    setHistoryLoading(true);
    api.get(`/prices/history/${id}`, {
      params: { origin, destination: dest, cabin_class: cabin, days: historyDays },
    })
      .then((r) => setPriceHistory(r.data))
      .catch(() => setPriceHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [id, route, historyDays, cabinFilter]);

  const handleScan = () => scanRoute(id);

  const handleDelete = async () => {
    if (!confirm(`Delete route "${route?.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api.delete(`/routes/${id}`);
      fetchRoutes();
      navigate("/");
    } catch { setDeleting(false); }
  };

  const handleToggleActive = async () => {
    await api.patch(`/routes/${id}`, { is_active: !route.is_active });
    fetchRoutes();
  };

  if (!route && routes.length > 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-zinc-500 dark:text-zinc-400">Route not found.</p>
        <button onClick={() => navigate("/")} className="btn-ghost mt-4">← Back</button>
      </div>
    );
  }

  const isScanning = scanning[id] ?? false;
  const meta       = scanMeta[id];

  // Filtered deals
  const filteredDeals = cabinFilter
    ? deals.filter((d) => d.cabin_class === cabinFilter)
    : deals;

  // Best deal for current price reference
  const bestDeal = filteredDeals[0] ?? null;

  return (
    <div className="min-h-0">
      {/* ── Route header ──────────────────────────────────────────────── */}
      <div className="px-6 sm:px-8 py-5 border-b border-zinc-200 dark:border-zinc-800
                      bg-white dark:bg-zinc-900 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={() => navigate("/")}
              className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors text-sm"
            >
              ← Home
            </button>
            <span className="text-zinc-300 dark:text-zinc-700">/</span>
            <span className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
              {route?.name ?? "Loading…"}
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {route ? (
              <>
                {route.origins.join(", ")} → {route.destinations.join(", ")}
                {" · "}{route.cabin_classes.map((c) => CABIN_LABEL[c] ?? c).join(", ")}
                {" · "}
                {route.date_from && route.date_to
                  ? `${format(new Date(route.date_from), "d MMM")} – ${format(new Date(route.date_to), "d MMM yyyy")}`
                  : ""}
              </>
            ) : ""}
          </p>
          {meta && !meta.error && meta.time && (
            <p className="text-2xs text-zinc-400 dark:text-zinc-500 mt-0.5">
              Last scan {formatDistanceToNow(meta.time, { addSuffix: true })}
              {" · "}{meta.scored ?? 0} deals scored
            </p>
          )}
          {meta?.error && (
            <p className="text-2xs text-red-500 mt-0.5">Last scan failed</p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Cabin filter */}
          {route?.cabin_classes.length > 1 && (
            <select
              value={cabinFilter ?? ""}
              onChange={(e) => setCabinFilter(e.target.value || null)}
              className="input py-1.5 text-xs"
            >
              <option value="">All cabins</option>
              {route.cabin_classes.map((c) => (
                <option key={c} value={c}>{CABIN_LABEL[c]}</option>
              ))}
            </select>
          )}

          <button
            onClick={handleScan}
            disabled={isScanning}
            className="btn-primary text-xs py-1.5 px-3 disabled:opacity-50"
          >
            {isScanning ? (
              <span className="flex items-center gap-1.5">
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/>
                </svg>
                Scanning…
              </span>
            ) : "Scan Now"}
          </button>

          <button
            onClick={handleToggleActive}
            className="btn-ghost text-xs py-1.5 px-3"
          >
            {route?.is_active ? "Pause" : "Resume"}
          </button>

          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-colors px-2"
          >
            Delete
          </button>
        </div>
      </div>

      {/* ── Two-column body ────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row min-h-0">

        {/* ── Left: Chart + Timeline ─────────────────────────────────── */}
        <div className="flex-1 min-w-0 p-6 sm:p-8 space-y-6 lg:border-r border-zinc-200 dark:border-zinc-800">

          {/* Price chart */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                Price History
              </p>
              <div className="flex items-center gap-1.5">
                {[7, 30, 60, 90].map((d) => (
                  <button
                    key={d}
                    onClick={() => setHistoryDays(d)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                      historyDays === d
                        ? "bg-brand-500 text-white border-brand-500"
                        : "bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700"
                    }`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>

            {historyLoading ? (
              <div className="h-56 flex items-center justify-center text-sm text-zinc-400 animate-pulse">
                Loading…
              </div>
            ) : priceHistory.length === 0 ? (
              <div className="h-56 flex flex-col items-center justify-center text-center">
                <p className="text-sm font-medium text-zinc-900 dark:text-white mb-1">No data yet</p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  Price history will appear after the first scan.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={priceHistory} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="bandGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#f26419" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#f26419" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="avgGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#f26419" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#f26419" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.06}/>
                  <XAxis
                    dataKey="bucket"
                    tickFormatter={(v) => { try { return format(parseISO(v), "d MMM"); } catch { return v; } }}
                    tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
                    tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={45}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="p90" name="P90" stroke="transparent" fill="url(#bandGrad)" legendType="none"/>
                  <Area type="monotone" dataKey="p10" name="P10" stroke="transparent" fill="white" fillOpacity={0} legendType="none"/>
                  <Area type="monotone" dataKey="avg_price" name="Avg" stroke="#f26419" strokeWidth={2} fill="url(#avgGrad)" dot={false}/>
                  <Area type="monotone" dataKey="min_price" name="Min" stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 2" fill="transparent" dot={false}/>
                  {bestDeal?.best_price_usd && (
                    <ReferenceLine
                      y={bestDeal.best_price_usd}
                      stroke="#f5c842"
                      strokeDasharray="4 4"
                      label={{ value: `Now $${Math.round(bestDeal.best_price_usd / 1000)}k`, fill: "#f5c842", fontSize: 10 }}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Activity Timeline */}
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">
              Activity Timeline
            </p>
            <div className="card p-4">
              <ActivityTimeline
                routeId={id}
                onEventClick={(event) => {
                  // Find matching deal by deal_analysis_id if available
                  if (event.deal_analysis_id) {
                    const match = deals.find((d) => d.id === event.deal_analysis_id);
                    if (match) setSelectedDeal(match);
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* ── Right: Leaderboard + Award + AI ────────────────────────── */}
        <div className="lg:w-80 xl:w-96 p-6 sm:p-8 space-y-5 flex-shrink-0">

          {/* Airline leaderboard */}
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">
              Airline Prices
            </p>
            <div className="card p-2">
              <AirlineLeaderboard
                offers={bestOffers}
                parentDeal={bestDeal}
                onSelect={setSelectedDeal}
                selectedDeal={selectedDeal}
              />
            </div>
          </div>

          {/* Best award option */}
          {bestDeal?.best_award_miles && (
            <div className="card p-4">
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
                Best Award
              </p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                    {bestDeal.best_award_miles.toLocaleString()} miles
                  </p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                    via {bestDeal.best_award_program}
                  </p>
                </div>
                {bestDeal.best_cpp && (
                  <span className="text-sm font-bold text-brand-500">
                    {bestDeal.best_cpp.toFixed(1)}¢/pt
                  </span>
                )}
              </div>
            </div>
          )}

          {/* AI insight */}
          {bestDeal?.ai_recommendation_en && (
            <div className="card p-4">
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
                AI Analysis
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
                {bestDeal.ai_recommendation_en}
              </p>
            </div>
          )}

          {/* Route stats */}
          {filteredDeals.length > 0 && (
            <div className="card p-4 space-y-3">
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                Route Stats
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Best price",  value: `$${Math.min(...filteredDeals.map(d => d.best_price_usd)).toLocaleString()}` },
                  { label: "Deals tracked", value: filteredDeals.length },
                  { label: "Top score",   value: `${Math.round((Math.max(...filteredDeals.map(d => d.score_total)) / 170) * 100)}/100` },
                  { label: "GEM deals",  value: filteredDeals.filter(d => d.is_gem).length },
                ].map(({ label, value }) => (
                  <div key={label} className="text-center px-3 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800">
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-0.5">{label}</p>
                    <p className="text-base font-semibold text-zinc-900 dark:text-white tabular-nums">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Level 3: Ticket Detail Panel ──────────────────────────────── */}
      {selectedDeal && (
        <TicketDetailPanel
          deal={selectedDeal}
          onClose={() => setSelectedDeal(null)}
          routeOrigins={route?.origins ?? []}
        />
      )}
    </div>
  );
}
