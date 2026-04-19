import { useEffect, useState, useMemo } from "react";
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
import FormattedText from "../components/FormattedText";
import EnhancedPriceChart from "../components/EnhancedPriceChart";
import CheapestDateStrip from "../components/CheapestDateStrip";
import EventTimeline from "../components/EventTimeline";
import IntelligencePanel from "../components/IntelligencePanel";
import TripTypeComparison from "../components/TripTypeComparison";
import AIInsightPanel from "../components/AIInsightPanel";
import popularAirports from "../data/airports.json";

const AIRPORT_MAP = Object.fromEntries(popularAirports.map((a) => [a.iata, a]));

const CABIN_LABEL = {
  BUSINESS: "Business",
  FIRST: "First Class",
  PREMIUM_ECONOMY: "Premium Economy",
};

const CABIN_COLOR = {
  BUSINESS:        "bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300",
  FIRST:           "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300",
  PREMIUM_ECONOMY: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
};

/** "MIA" → "Miami" if known, otherwise "MIA" */
function cityName(iata) {
  return AIRPORT_MAP[iata]?.city ?? iata;
}

/** Format list of IATA codes as "City · City · City" with IATA tooltip */
function AirportList({ codes }) {
  return (
    <span className="inline-flex flex-wrap gap-x-2 gap-y-0.5">
      {codes.map((code, i) => (
        <span key={code} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-zinc-400 dark:text-zinc-600 select-none">·</span>}
          <span title={code} className="font-medium text-zinc-800 dark:text-zinc-100">
            {cityName(code)}
          </span>
          <span className="text-zinc-400 dark:text-zinc-500 text-2xs tabular-nums">({code})</span>
        </span>
      ))}
    </span>
  );
}

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
  const [timelineKey,    setTimelineKey]     = useState(0);
  const [routeEvents,    setRouteEvents]     = useState([]);
  const [forecast,       setForecast]        = useState(null);
  const [timelineMode,   setTimelineMode]    = useState("events"); // events | scans

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

  // Load per-airline offers across ALL deals for this route (powers AirlineLeaderboard)
  useEffect(() => {
    if (!id) return;
    const params = cabinFilter ? { cabin_class: cabinFilter } : {};
    api.get(`/deals/offers/route/${id}`, { params })
      .then((r) => setBestOffers(r.data))
      .catch(() => setBestOffers([]));
  }, [id, cabinFilter]);

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

  // Load route events (for timeline overlay on chart + EventTimeline component)
  useEffect(() => {
    if (!id) return;
    api.get(`/events/route/${id}`, { params: { limit: 50 } })
      .then((r) => setRouteEvents(r.data))
      .catch(() => setRouteEvents([]));
  }, [id, timelineKey]);

  // Load forecast (best-effort; ignored if not enough history)
  useEffect(() => {
    if (!id || !route) return;
    const cabin = cabinFilter ?? route.cabin_classes[0] ?? "BUSINESS";
    api.get(`/intelligence/${id}/forecast`, { params: { cabin_class: cabin } })
      .then((r) => setForecast(r.data))
      .catch(() => setForecast(null));
  }, [id, route, cabinFilter]);
      .catch(() => setPriceHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [id, route, historyDays, cabinFilter]);

  const handleScan = async () => {
    await scanRoute(id);
    setTimelineKey((k) => k + 1);  // force timeline to re-fetch after scan
  };

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

  // Map of deal.id → deal for AirlineLeaderboard per-row resolution
  const dealMap = useMemo(() => new Map(deals.map((d) => [d.id, d])), [deals]);

  // Best price per origin airport — passed to the map component so it can show prices on pins
  const dealsByOrigin = useMemo(() => {
    const map = {};
    for (const d of filteredDeals) {
      if (!d.origin) continue;
      if (!map[d.origin] || d.best_price_usd < map[d.origin].price_usd) {
        map[d.origin] = { price_usd: d.best_price_usd, departure_date: d.departure_date };
      }
    }
    return map;
  }, [filteredDeals]);

  return (
    <div className="min-h-0">
      {/* ── Route header ──────────────────────────────────────────────── */}
      <div className="px-6 sm:px-8 py-5 border-b border-zinc-200 dark:border-zinc-800
                      bg-white dark:bg-zinc-900 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => navigate("/")}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors text-xs font-medium"
            >
              ← Home
            </button>
            <span className="text-zinc-300 dark:text-zinc-700 text-xs">/</span>
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 truncate">
              {route?.name ?? "Loading…"}
            </span>
          </div>

          {route ? (
            <>
              {/* Origins → Destinations */}
              <div className="flex items-start gap-3 flex-wrap mb-2.5">
                <div className="min-w-0">
                  <p className="text-2xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide mb-0.5">From</p>
                  <AirportList codes={route.origins} />
                </div>
                <span className="text-xl text-zinc-300 dark:text-zinc-600 mt-4 flex-shrink-0">→</span>
                <div className="min-w-0">
                  <p className="text-2xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide mb-0.5">To</p>
                  <AirportList codes={route.destinations} />
                </div>
              </div>

              {/* Cabin badges + date range */}
              <div className="flex items-center flex-wrap gap-1.5">
                {route.cabin_classes.map((c) => (
                  <span key={c} className={`text-2xs font-semibold px-2 py-0.5 rounded-full ${CABIN_COLOR[c] ?? "bg-zinc-100 dark:bg-zinc-800 text-zinc-500"}`}>
                    {CABIN_LABEL[c] ?? c}
                  </span>
                ))}
                {route.date_from && route.date_to && (
                  <span className="text-2xs text-zinc-500 dark:text-zinc-400 ml-1">
                    📅 {format(new Date(route.date_from + "T12:00:00"), "d MMM")} – {format(new Date(route.date_to + "T12:00:00"), "d MMM yyyy")}
                  </span>
                )}
              </div>

              {/* Scan status */}
              <div className="mt-1.5">
                {meta && !meta.error && meta.time && (
                  <p className="text-2xs text-zinc-400 dark:text-zinc-500">
                    Last scan {formatDistanceToNow(meta.time, { addSuffix: true })}
                    {" · "}
                    <span className={meta.scored > 0 ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}>
                      {meta.scored ?? 0} deal{meta.scored !== 1 ? "s" : ""} scored
                    </span>
                  </p>
                )}
                {meta?.error && (
                  <p className="text-2xs text-red-500 font-medium">⚠ Last scan failed</p>
                )}
              </div>
            </>
          ) : (
            <div className="h-12 w-64 bg-zinc-100 dark:bg-zinc-800 rounded-lg animate-pulse" />
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
              {historyLoading && (
                <span className="text-2xs text-zinc-400 animate-pulse">Loading…</span>
              )}
            </div>
            <EnhancedPriceChart
              history={priceHistory}
              events={routeEvents}
              forecast={forecast}
              currentPrice={bestDeal?.best_price_usd}
              defaultRangeDays={historyDays}
              onRangeChange={setHistoryDays}
            />
          </div>

          {/* Cheapest dates strip */}
          <CheapestDateStrip
            routeId={id}
            cabinClass={cabinFilter ?? route?.cabin_classes?.[0] ?? "BUSINESS"}
            origin={route?.origins?.[0]}
            destination={route?.destinations?.[0]}
            onSelectDate={(date) => {
              const match = filteredDeals.find((d) => d.departure_date === date);
              if (match) setSelectedDeal(match);
            }}
          />

          {/* Activity Timeline (Events / Scans tabs) */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                Activity Timeline
              </p>
              <div className="flex items-center gap-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 p-0.5">
                {[
                  { key: "events", label: "Events" },
                  { key: "scans",  label: "Scans" },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setTimelineMode(key)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                      timelineMode === key
                        ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm"
                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="card p-4">
              {timelineMode === "events" ? (
                <EventTimeline
                  routeId={id}
                  refreshKey={timelineKey}
                  onEventClick={(event) => {
                    if (event.deal_analysis_id) {
                      const match = deals.find((d) => d.id === event.deal_analysis_id);
                      if (match) setSelectedDeal(match);
                    }
                  }}
                />
              ) : (
                <ActivityTimeline
                  routeId={id}
                  refreshKey={timelineKey}
                  onEventClick={(event) => {
                    if (event.deal_analysis_id) {
                      const match = deals.find((d) => d.id === event.deal_analysis_id);
                      if (match) setSelectedDeal(match);
                    }
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {/* ── Right: Leaderboard + Award + AI ────────────────────────── */}
        <div className="lg:w-[460px] xl:w-[520px] p-6 sm:p-8 space-y-5 flex-shrink-0">

          {/* Airline leaderboard */}
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">
              Airline Prices
            </p>
            <div className="card p-2">
              <AirlineLeaderboard
                offers={bestOffers}
                parentDeal={bestDeal}
                dealMap={dealMap}
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

          {/* Intelligence (regime, forecast, cycle, dow, lead-time, verdict) */}
          <IntelligencePanel
            routeId={id}
            cabinClass={cabinFilter ?? route?.cabin_classes?.[0] ?? "BUSINESS"}
            origin={route?.origins?.[0]}
            destination={route?.destinations?.[0]}
          />

          {/* Trip type comparison (only meaningful for MONITOR routes) */}
          {route?.trip_type === "MONITOR" && (
            <TripTypeComparison
              routeId={id}
              cabinClass={cabinFilter ?? route?.cabin_classes?.[0] ?? "BUSINESS"}
            />
          )}

          {/* AI insight */}
          <AIInsightPanel deal={bestDeal} language="en" />

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
          dealsByOrigin={dealsByOrigin}
        />
      )}
    </div>
  );
}
