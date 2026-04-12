import { useEffect, useState } from "react";
import { useRoutesStore } from "../stores/useRoutes";
import RouteCard from "../components/RouteCard";
import AddRouteModal from "../components/AddRouteModal";

const CABIN_FILTERS = [
  { value: null,              label: "All cabins" },
  { value: "BUSINESS",       label: "Business" },
  { value: "FIRST",          label: "First" },
  { value: "PREMIUM_ECONOMY",label: "Premium Eco" },
];

export default function Home() {
  const { routes, loading, error, bestDeals, scanning, fetchRoutes, scanRoute } =
    useRoutesStore();
  const [showModal,  setShowModal]  = useState(false);
  const [cabinFilter, setCabinFilter] = useState(null);

  useEffect(() => { fetchRoutes(); }, []);

  const filtered = cabinFilter
    ? routes.filter((r) => r.cabin_classes.includes(cabinFilter))
    : routes;

  // Sort: active first, then by best deal score desc
  const sorted = [...filtered].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    const aScore = bestDeals[a.id]?.score_total ?? 0;
    const bScore = bestDeals[b.id]?.score_total ?? 0;
    return bScore - aScore;
  });

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white tracking-tight">
            My Routes
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {routes.length === 0
              ? "No routes yet — add your first corridor below"
              : `${routes.length} route${routes.length !== 1 ? "s" : ""} being monitored`}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="btn-primary flex-shrink-0"
        >
          + Add Route
        </button>
      </div>

      {/* ── Cabin filter pills ──────────────────────────────────────────── */}
      {routes.length > 0 && (
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          {CABIN_FILTERS.map(({ value, label }) => (
            <button
              key={label}
              onClick={() => setCabinFilter(value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                cabinFilter === value
                  ? "bg-brand-500 text-white border-brand-500"
                  : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-brand-300 dark:hover:border-brand-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── States ─────────────────────────────────────────────────────── */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2].map((i) => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded w-1/2 mb-2" />
              <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded w-3/4 mb-4" />
              <div className="h-8 bg-zinc-100 dark:bg-zinc-800 rounded" />
            </div>
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="text-center py-12 text-sm text-red-500">{error}</div>
      )}

      {!loading && routes.length === 0 && (
        <div className="card p-12 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl
                          bg-zinc-100 dark:bg-zinc-800 mb-4">
            <svg className="w-6 h-6 text-zinc-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 17L10 3L17 17M7 13h6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p className="text-base font-medium text-zinc-900 dark:text-white mb-1">
            No routes yet
          </p>
          <p className="text-sm text-zinc-400 dark:text-zinc-500 mb-5">
            Add your first corridor to start monitoring Business &amp; First class fares.
          </p>
          <button onClick={() => setShowModal(true)} className="btn-primary">
            + Add First Route
          </button>
        </div>
      )}

      {/* ── Route grid ─────────────────────────────────────────────────── */}
      {!loading && sorted.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {sorted.map((route) => (
            <RouteCard
              key={route.id}
              route={route}
              deal={bestDeals[route.id] ?? null}
              scanning={scanning[route.id] ?? false}
              onScan={() => scanRoute(route.id)}
            />
          ))}
        </div>
      )}

      {/* ── Add Route Modal ─────────────────────────────────────────────── */}
      {showModal && <AddRouteModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
