import { useState, useEffect } from "react";
import api from "../lib/api";

const CABINS  = ["BUSINESS", "FIRST", "PREMIUM_ECONOMY"];
const AIRPORTS = ["MIA", "MCO", "FLL", "GRU", "CNF", "BSB", "REC", "FOR", "SSA", "CWB"];

const CABIN_LABEL = { BUSINESS: "Business", FIRST: "First Class", PREMIUM_ECONOMY: "Premium Economy" };
const TIER_STYLE  = {
  HOT:  "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/20",
  WARM: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20",
  COLD: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/20",
};

const EMPTY_FORM = {
  name: "", origins: [], destinations: [], cabin_classes: [],
  date_from: "", date_to: "",
  trip_type: "ONE_WAY", return_date_offset_days: 7,
};

export default function RouteManager() {
  const [routes,   setRoutes]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState(EMPTY_FORM);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");
  const [scanning, setScanning] = useState({});   // { [route.id]: "scanning" | "done" | "error" }
  const [scanResult, setScanResult] = useState({});  // { [route.id]: { prices_found, best } }

  const fetchRoutes = async () => {
    try {
      const { data } = await api.get("/routes/");
      setRoutes(data);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { fetchRoutes(); }, []);

  const toggleArray = (key, value) =>
    setForm(f => ({
      ...f,
      [key]: f[key].includes(value) ? f[key].filter(x => x !== value) : [...f[key], value],
    }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.origins.length || !form.destinations.length || !form.cabin_classes.length) {
      setError("Select at least one origin, destination, and cabin class."); return;
    }
    setSaving(true); setError("");
    try {
      await api.post("/routes/", form);
      setShowForm(false); setForm(EMPTY_FORM);
      fetchRoutes();
    } catch (err) {
      setError(err.response?.data?.detail ?? "Failed to create route.");
    } finally { setSaving(false); }
  };

  const toggleActive = async (route) => {
    await api.patch(`/routes/${route.id}`, { is_active: !route.is_active });
    fetchRoutes();
  };

  const deleteRoute = async (id) => {
    if (!confirm("Delete this route?")) return;
    await api.delete(`/routes/${id}`);
    fetchRoutes();
  };

  const scanRoute = async (route) => {
    setScanning(s => ({ ...s, [route.id]: "scanning" }));
    setScanResult(r => ({ ...r, [route.id]: null }));
    try {
      const { data } = await api.post(`/scan/route/${route.id}`);
      const found = data.sources?.serpapi ?? 0;
      const best  = data.best_prices?.[0];
      setScanResult(r => ({ ...r, [route.id]: { found, best } }));
      setScanning(s => ({ ...s, [route.id]: "done" }));
    } catch {
      setScanning(s => ({ ...s, [route.id]: "error" }));
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white tracking-tight">
            Routes
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Corridors FlyLuxuryDeals monitors for you
          </p>
        </div>
        <button onClick={() => { setShowForm(true); setForm(EMPTY_FORM); }} className="btn-primary">
          + Add Route
        </button>
      </div>

      {showForm && (
        <div className="card p-6 mb-6 animate-slide-up">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white mb-5">
            New Route
          </h2>
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
                    <button type="button" key={a}
                      onClick={() => toggleArray("origins", a)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                        form.origins.includes(a)
                          ? "bg-brand-500 text-white border-brand-500"
                          : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-brand-300"
                      }`}
                    >{a}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label block mb-2">Destinations</label>
                <div className="flex flex-wrap gap-2">
                  {AIRPORTS.map(a => (
                    <button type="button" key={a}
                      onClick={() => toggleArray("destinations", a)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                        form.destinations.includes(a)
                          ? "bg-brand-500 text-white border-brand-500"
                          : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-brand-300"
                      }`}
                    >{a}</button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="label block mb-2">Cabin Classes</label>
              <div className="flex gap-3">
                {CABINS.map(c => (
                  <button type="button" key={c}
                    onClick={() => toggleArray("cabin_classes", c)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                      form.cabin_classes.includes(c)
                        ? "bg-brand-500 text-white border-brand-500"
                        : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-brand-300"
                    }`}
                  >{CABIN_LABEL[c]}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="label block mb-2">Trip Type</label>
              <div className="flex gap-2">
                {["ONE_WAY", "ROUND_TRIP"].map(t => (
                  <button type="button" key={t}
                    onClick={() => setForm(f => ({ ...f, trip_type: t }))}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                      form.trip_type === t
                        ? "bg-brand-500 text-white border-brand-500"
                        : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-brand-300"
                    }`}
                  >{t === "ONE_WAY" ? "One Way" : "Round Trip"}</button>
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

            {form.trip_type === "ROUND_TRIP" && (
              <div>
                <label className="label block mb-1.5">Return after (days)</label>
                <input
                  type="number" min="1" max="90"
                  className="input w-32"
                  value={form.return_date_offset_days}
                  onChange={e => setForm(f => ({ ...f, return_date_offset_days: Number(e.target.value) }))}
                />
                <p className="text-2xs text-zinc-400 dark:text-zinc-500 mt-1">
                  How many days after each departure date to set the return
                </p>
              </div>
            )}

            {error && (
              <p className="text-xs text-red-600 dark:text-red-400 px-3 py-2 rounded-xl
                            bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
                {error}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? "Saving…" : "Create Route"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-ghost">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center py-12">
          Loading routes…
        </p>
      ) : routes.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 mb-4">
            <svg className="w-5 h-5 text-zinc-400" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 10h14M10 3l4 4-4 4M17 17H3"/>
            </svg>
          </div>
          <p className="text-base font-medium text-zinc-900 dark:text-white mb-1">
            No routes yet
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Add your first corridor above to start scanning.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {routes.map(route => (
            <div key={route.id} className={`card p-5 ${!route.is_active ? "opacity-50" : ""}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base font-semibold text-zinc-900 dark:text-white">
                      {route.name}
                    </span>
                    <span className={`text-2xs px-2 py-0.5 rounded-md font-semibold border ${TIER_STYLE[route.priority_tier] ?? TIER_STYLE.WARM}`}>
                      {route.priority_tier}
                    </span>
                    {!route.is_active && (
                      <span className="text-2xs px-2 py-0.5 rounded-md font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                        Paused
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {route.origins.join(", ")} → {route.destinations.join(", ")}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {route.cabin_classes.map(c => (
                      <span key={c} className="text-2xs px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                        {CABIN_LABEL[c]}
                      </span>
                    ))}
                    <span className="text-2xs px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                      {route.trip_type === "ROUND_TRIP"
                        ? `Round Trip · +${route.return_date_offset_days}d`
                        : "One Way"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => scanRoute(route)}
                    disabled={scanning[route.id] === "scanning"}
                    className="btn-primary text-xs py-1.5 px-3 disabled:opacity-50"
                  >
                    {scanning[route.id] === "scanning" ? "Scanning…" : "Scan Now"}
                  </button>
                  <button onClick={() => toggleActive(route)} className="btn-ghost text-xs py-1.5 px-3">
                    {route.is_active ? "Pause" : "Resume"}
                  </button>
                  <button onClick={() => deleteRoute(route.id)} className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-colors px-2">
                    Delete
                  </button>
                </div>
              </div>
              {scanning[route.id] === "error" && (
                <p className="mt-3 text-xs text-red-500 dark:text-red-400">
                  Scan failed — check that SERPAPI_API_KEY is set in EasyPanel.
                </p>
              )}
              {scanning[route.id] === "done" && scanResult[route.id] && (
                <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>
                    <span className="font-semibold text-zinc-900 dark:text-white">
                      {scanResult[route.id].found}
                    </span> prices collected
                  </span>
                  {scanResult[route.id].best && (
                    <span>
                      Best: <span className="font-semibold text-brand-500">
                        ${scanResult[route.id].best.price_usd?.toLocaleString()}
                      </span>{" "}
                      {scanResult[route.id].best.origin}→{scanResult[route.id].best.destination}{" "}
                      {scanResult[route.id].best.cabin_class?.replace("_", " ")}
                    </span>
                  )}
                  {scanResult[route.id].found === 0 && (
                    <span className="text-amber-500">No prices returned — SerpApi may need a valid date range.</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}