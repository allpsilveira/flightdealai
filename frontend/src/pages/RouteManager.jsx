import { useState, useEffect, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import api from "../lib/api";
import DealCard from "../components/DealCard";
import DealDetail from "../components/DealDetail";

const CABINS   = ["BUSINESS", "FIRST", "PREMIUM_ECONOMY"];
const AIRPORTS = ["MIA", "MCO", "FLL", "GRU", "CNF", "BSB", "REC", "FOR", "SSA", "CWB"];
const CABIN_LABEL = { BUSINESS: "Business", FIRST: "First Class", PREMIUM_ECONOMY: "Premium Economy" };

const TIER_STYLE = {
  HOT:  "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/20",
  WARM: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20",
  COLD: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/20",
};

const EMPTY_FORM = {
  name: "", origins: [], destinations: [], cabin_classes: [],
  date_from: "", date_to: "",
};

export default function RouteManager() {
  const [routes,     setRoutes]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [saving,     setSaving]     = useState(false);
  const [formError,  setFormError]  = useState("");
  const [scanning,   setScanning]   = useState({});      // { [routeId]: bool }
  const [scanMeta,   setScanMeta]   = useState({});      // { [routeId]: { found, scored, time } }
  const [deals,      setDeals]      = useState({});      // { [routeId]: DealResponse[] }
  const [selectedDeal, setSelectedDeal] = useState(null);

  const fetchRoutes = useCallback(async () => {
    try {
      const { data } = await api.get("/routes/");
      setRoutes(data);
      // Load deals for each route
      data.forEach(r => loadDeals(r.id));
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRoutes(); }, [fetchRoutes]);

  const loadDeals = async (routeId) => {
    try {
      const { data } = await api.get(`/deals/?route_id=${routeId}&limit=20`);
      setDeals(prev => ({ ...prev, [routeId]: data }));
    } catch { /* ignore */ }
  };

  const toggleArray = (key, value) =>
    setForm(f => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter(x => x !== value) : [...f[key], value],
    }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.origins.length || !form.destinations.length || !form.cabin_classes.length) {
      setFormError("Select at least one origin, destination, and cabin class."); return;
    }
    setSaving(true); setFormError("");
    try {
      await api.post("/routes/", form);
      setShowForm(false); setForm(EMPTY_FORM);
      fetchRoutes();
    } catch (err) {
      setFormError(err.response?.data?.detail ?? "Failed to create route.");
    } finally { setSaving(false); }
  };

  const toggleActive = async (route) => {
    await api.patch(`/routes/${route.id}`, { is_active: !route.is_active });
    fetchRoutes();
  };

  const deleteRoute = async (id) => {
    if (!confirm("Delete this route?")) return;
    await api.delete(`/routes/${id}`);
    setDeals(prev => { const n = {...prev}; delete n[id]; return n; });
    fetchRoutes();
  };

  const scanRoute = async (route) => {
    setScanning(s => ({ ...s, [route.id]: true }));
    try {
      const { data } = await api.post(`/scan/route/${route.id}`);
      setScanMeta(m => ({
        ...m,
        [route.id]: { found: data.sources?.serpapi ?? 0, scored: data.deals_scored, time: new Date() },
      }));
      await loadDeals(route.id);
    } catch {
      setScanMeta(m => ({ ...m, [route.id]: { error: true } }));
    } finally {
      setScanning(s => ({ ...s, [route.id]: false }));
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white tracking-tight">
            Monitoring
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Active corridors — click Scan Now to get fresh prices
          </p>
        </div>
        <button onClick={() => { setShowForm(true); setForm(EMPTY_FORM); }} className="btn-primary">
          + Add Route
        </button>
      </div>

      {/* Add route form */}
      {showForm && (
        <div className="card p-6 mb-6 animate-slide-up">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white mb-5">New Route</h2>
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="label block mb-1.5">Route Name</label>
              <input
                className="input" required placeholder="e.g. South Florida → Brazil"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="label block mb-2">Origins</label>
                <div className="flex flex-wrap gap-2">
                  {AIRPORTS.map(a => (
                    <button type="button" key={a} onClick={() => toggleArray("origins", a)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                        form.origins.includes(a)
                          ? "bg-brand-500 text-white border-brand-500"
                          : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-brand-300"
                      }`}>{a}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label block mb-2">Destinations</label>
                <div className="flex flex-wrap gap-2">
                  {AIRPORTS.map(a => (
                    <button type="button" key={a} onClick={() => toggleArray("destinations", a)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                        form.destinations.includes(a)
                          ? "bg-brand-500 text-white border-brand-500"
                          : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-brand-300"
                      }`}>{a}</button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="label block mb-2">Cabin Classes</label>
              <div className="flex gap-3">
                {CABINS.map(c => (
                  <button type="button" key={c} onClick={() => toggleArray("cabin_classes", c)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                      form.cabin_classes.includes(c)
                        ? "bg-brand-500 text-white border-brand-500"
                        : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-brand-300"
                    }`}>{CABIN_LABEL[c]}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label block mb-1.5">Date From</label>
                <input type="date" className="input" required
                  value={form.date_from} onChange={e => setForm(f => ({ ...f, date_from: e.target.value }))} />
              </div>
              <div>
                <label className="label block mb-1.5">Date To</label>
                <input type="date" className="input" required
                  value={form.date_to} onChange={e => setForm(f => ({ ...f, date_to: e.target.value }))} />
              </div>
            </div>
            {formError && (
              <p className="text-xs text-red-600 dark:text-red-400 px-3 py-2 rounded-xl
                            bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
                {formError}
              </p>
            )}
            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? "Saving…" : "Create Route"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Route list */}
      {loading ? (
        <p className="text-sm text-zinc-400 text-center py-16">Loading routes…</p>
      ) : routes.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-base font-medium text-zinc-900 dark:text-white mb-1">No routes yet</p>
          <p className="text-sm text-zinc-400 dark:text-zinc-500">
            Add your first corridor above to start monitoring.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {routes.map(route => {
            const routeDeals = deals[route.id] ?? [];
            const meta = scanMeta[route.id];
            const isScanning = scanning[route.id];

            return (
              <div key={route.id} className={`card p-0 overflow-hidden ${!route.is_active ? "opacity-60" : ""}`}>
                {/* Route header */}
                <div className="flex items-center justify-between gap-4 p-5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base font-semibold text-zinc-900 dark:text-white">
                        {route.name}
                      </span>
                      <span className={`text-2xs px-2 py-0.5 rounded-md font-semibold border ${TIER_STYLE[route.priority_tier] ?? TIER_STYLE.WARM}`}>
                        {route.priority_tier}
                      </span>
                      {!route.is_active && (
                        <span className="text-2xs px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                          Paused
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {route.origins.join(", ")} → {route.destinations.join(", ")}
                      {" · "}
                      {route.cabin_classes.map(c => CABIN_LABEL[c]).join(", ")}
                    </p>
                    {meta && !meta.error && (
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                        Last scan{" "}
                        {meta.time ? formatDistanceToNow(meta.time, { addSuffix: true }) : "just now"}
                        {" · "}{meta.found} prices{" · "}
                        <span className="text-brand-500 font-medium">{meta.scored} deals scored</span>
                      </p>
                    )}
                    {meta?.error && (
                      <p className="text-xs text-red-500 mt-1">
                        Scan failed — check SERPAPI_API_KEY in EasyPanel
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => scanRoute(route)}
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
                    <button onClick={() => toggleActive(route)} className="btn-ghost text-xs py-1.5 px-3">
                      {route.is_active ? "Pause" : "Resume"}
                    </button>
                    <button onClick={() => deleteRoute(route.id)}
                      className="text-xs text-zinc-400 hover:text-red-500 transition-colors px-2">
                      Delete
                    </button>
                  </div>
                </div>

                {/* Deals grid */}
                {routeDeals.length > 0 && (
                  <div className="border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {routeDeals.map(deal => (
                        <DealCard
                          key={deal.id}
                          deal={deal}
                          onClick={setSelectedDeal}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {routeDeals.length === 0 && !isScanning && (
                  <div className="border-t border-zinc-100 dark:border-zinc-800 px-5 py-6 text-center">
                    <p className="text-sm text-zinc-400 dark:text-zinc-500">
                      No deals yet — hit <span className="font-medium text-zinc-600 dark:text-zinc-300">Scan Now</span> to fetch prices
                    </p>
                  </div>
                )}

                {isScanning && (
                  <div className="border-t border-zinc-100 dark:border-zinc-800 px-5 py-6 text-center">
                    <p className="text-sm text-zinc-400 dark:text-zinc-500 animate-pulse">
                      Scanning SerpApi → scoring → storing…
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Deal detail modal */}
      {selectedDeal && (
        <DealDetail deal={selectedDeal} onClose={() => setSelectedDeal(null)} />
      )}
    </div>
  );
}
