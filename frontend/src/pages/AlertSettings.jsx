import { useState, useEffect } from "react";
import api from "../lib/api";

const DEFAULT_RULE = {
  route_id: null,
  score_threshold: 80,
  gem_alerts: true,
  scarcity_alerts: true,
  trend_reversal_alerts: false,
  error_fare_alerts: true,
  whatsapp_enabled: false,
  web_push_enabled: true,
};

function Toggle({ value, onChange, label, description }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm font-medium text-zinc-900 dark:text-white">{label}</p>
        {description && <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
          value ? "bg-brand-500" : "bg-zinc-200 dark:bg-zinc-700"
        }`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
          value ? "translate-x-6" : "translate-x-1"
        }`}/>
      </button>
    </div>
  );
}

export default function AlertSettings() {
  const [routes,  setRoutes]  = useState([]);
  const [rules,   setRules]   = useState([]);
  const [form,    setForm]    = useState(DEFAULT_RULE);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState("");

  useEffect(() => {
    Promise.all([api.get("/routes/"), api.get("/alerts/")]).then(([r, a]) => {
      setRoutes(r.data); setRules(a.data);
    }).catch(() => {});
  }, []);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await api.post("/alerts/", form);
      const { data } = await api.get("/alerts/");
      setRules(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      setForm(DEFAULT_RULE);
    } catch (err) {
      setError(err.response?.data?.detail ?? "Failed to save.");
    } finally { setSaving(false); }
  };

  const deleteRule = async (id) => {
    await api.delete(`/alerts/${id}`);
    setRules(r => r.filter(x => x.id !== id));
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white tracking-tight">
          Alert Settings
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Configure when and how you get notified
        </p>
      </div>

      {rules.length > 0 && (
        <div className="card p-5 mb-6">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white mb-4">
            Active Rules
          </h2>
          <div className="space-y-3">
            {rules.map(rule => {
              const route = routes.find(r => r.id === rule.route_id);
              return (
                <div key={rule.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">
                      {route?.name ?? "All Routes"} — Score ≥ {rule.score_threshold}
                    </p>
                    <div className="flex gap-2 mt-1">
                      {rule.gem_alerts && <span className="text-2xs px-1.5 py-0.5 rounded bg-brand-50 dark:bg-brand-500/10 text-brand-500 border border-brand-200 dark:border-brand-500/20">GEM</span>}
                      {rule.whatsapp_enabled && <span className="text-2xs px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-500/20">WhatsApp</span>}
                      {rule.web_push_enabled && <span className="text-2xs px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20">Web Push</span>}
                    </div>
                  </div>
                  <button onClick={() => deleteRule(rule.id)} className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-red-500 transition-colors">
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card p-6">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-white mb-5">
          New Alert Rule
        </h2>
        <form onSubmit={submit} className="space-y-5">

          <div>
            <label className="label block mb-1.5">Route (optional)</label>
            <select className="input" value={form.route_id ?? ""} onChange={e => set("route_id", e.target.value || null)}>
              <option value="">All Routes</option>
              {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>

          <div>
            <label className="label block mb-1.5">Minimum Score</label>
            <div className="flex items-center gap-4">
              <input type="range" min="40" max="120" step="5"
                value={form.score_threshold}
                onChange={e => set("score_threshold", Number(e.target.value))}
                className="flex-1 accent-brand-500"
              />
              <span className="text-sm font-semibold text-zinc-900 dark:text-white w-8 text-center">
                {form.score_threshold}
              </span>
            </div>
            <div className="flex justify-between text-2xs text-zinc-500 dark:text-zinc-400 mt-1">
              <span>Watch (40)</span><span>Buy (80)</span><span>Strong Buy (100)</span>
            </div>
          </div>

          <div className="divider" />

          <div className="space-y-1 divide-y divide-zinc-100 dark:divide-zinc-800">
            <Toggle value={form.gem_alerts} onChange={v => set("gem_alerts", v)}
              label="GEM Alerts" description="Always alert on single-source anomaly fares" />
            <Toggle value={form.error_fare_alerts} onChange={v => set("error_fare_alerts", v)}
              label="Error Fare Alerts" description="Possible pricing mistakes (z-score > 2.5)" />
            <Toggle value={form.scarcity_alerts} onChange={v => set("scarcity_alerts", v)}
              label="Scarcity Alerts" description="Alert when ≤ 3 seats remain at deal price" />
            <Toggle value={form.trend_reversal_alerts} onChange={v => set("trend_reversal_alerts", v)}
              label="Trend Reversals" description="Price was dropping but just reversed upward" />
          </div>

          <div className="divider" />

          <div className="space-y-1 divide-y divide-zinc-100 dark:divide-zinc-800">
            <Toggle value={form.web_push_enabled} onChange={v => set("web_push_enabled", v)}
              label="Browser Notifications" description="Push notifications in this browser" />
            <Toggle value={form.whatsapp_enabled} onChange={v => set("whatsapp_enabled", v)}
              label="WhatsApp Alerts" description="Requires WhatsApp number in Settings" />
          </div>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
              {error}
            </p>
          )}

          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save Rule"}
          </button>
        </form>
      </div>
    </div>
  );
}