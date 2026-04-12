import { useState } from "react";
import { useAuthStore } from "../stores/useAuth";
import { useWebPush } from "../hooks/useWebPush";
import api from "../lib/api";

export default function Settings() {
  const user       = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const logout     = useAuthStore((s) => s.logout);

  const { supported: pushSupported, subscribed, loading: pushLoading, error: pushError, subscribe, unsubscribe } = useWebPush();

  const [language, setLanguage] = useState(user?.language ?? "en");
  const [whatsapp, setWhatsapp] = useState(user?.whatsapp_number ?? "");
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState("");

  const save = async () => {
    setSaving(true); setError("");
    try {
      await api.patch("/auth/me", { language, whatsapp_number: whatsapp || null });
      updateUser({ language, whatsapp_number: whatsapp || null });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.response?.data?.detail ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white tracking-tight">Settings</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Account preferences and notification setup</p>
      </div>

      {/* ── Account ──────────────────────────────────────────────────────── */}
      <div className="card p-6 mb-4">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-white mb-5">Account</h2>
        <div className="space-y-5">
          <div>
            <label className="label block mb-1.5">Email</label>
            <input
              className="input opacity-60 cursor-not-allowed"
              value={user?.email ?? ""}
              disabled readOnly
            />
          </div>
          <div>
            <label className="label block mb-1.5">Language</label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="input">
              <option value="en">English 🇺🇸</option>
              <option value="es">Español 🇪🇸</option>
              <option value="pt">Português 🇧🇷</option>
            </select>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1.5">
              AI recommendations and alerts will be delivered in this language.
            </p>
          </div>
        </div>
      </div>

      {/* ── Browser notifications ────────────────────────────────────────── */}
      {pushSupported && (
        <div className="card p-6 mb-4">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white mb-1">Browser Notifications</h2>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-5">
            Receive deal alerts as push notifications in this browser, even when the tab is closed.
          </p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-white">
                {subscribed ? "Notifications enabled" : "Notifications disabled"}
              </p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                {subscribed ? "This browser will receive deal alerts." : "Click Enable to allow notifications."}
              </p>
              {pushError && <p className="text-xs text-red-500 mt-1">{pushError}</p>}
            </div>
            <button
              onClick={subscribed ? unsubscribe : subscribe}
              disabled={pushLoading}
              className={subscribed ? "btn-ghost text-xs py-1.5 px-3" : "btn-primary text-xs py-1.5 px-3"}
            >
              {pushLoading ? "…" : subscribed ? "Disable" : "Enable"}
            </button>
          </div>
        </div>
      )}

      {/* ── WhatsApp ─────────────────────────────────────────────────────── */}
      <div className="card p-6 mb-4">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-white mb-1">WhatsApp Alerts</h2>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-5">
          Receive deal alerts and a weekly briefing every Monday at 7 AM.
        </p>
        <div>
          <label className="label block mb-1.5">Phone Number</label>
          <input
            type="tel"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            className="input"
            placeholder="+1 (239) 000-0000"
          />
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1.5">
            International format — e.g. +12392221234. Powered by Twilio WhatsApp Business.
          </p>
        </div>
      </div>

      {/* ── Data sources ─────────────────────────────────────────────────── */}
      <div className="card p-6 mb-6">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-white mb-4">Data Source Status</h2>
        <div className="space-y-3 divide-y divide-zinc-100 dark:divide-zinc-800">
          {[
            { name: "SerpApi (Google Flights)", description: "Price trends, typical range, price history — scans every 4h" },
            { name: "Duffel",                   description: "Fare brand detail, conditions — fires on BUY/GEM only" },
            { name: "Seats.aero",               description: "Award availability across 24 loyalty programs" },
            { name: "Anthropic Claude",          description: "AI deal recommendations in EN + PT" },
            { name: "Twilio WhatsApp",           description: "Alert delivery via WhatsApp Business" },
          ].map(({ name, description }) => (
            <div key={name} className="flex items-center justify-between pt-3 first:pt-0">
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-white">{name}</p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{description}</p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 flex-shrink-0 ml-4">
                env var
              </span>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 px-3 py-2 rounded-xl
                      bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 mb-4">
          {error}
        </p>
      )}

      <div className="flex items-center gap-4 mb-6">
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save Changes"}
        </button>
        <button
          onClick={logout}
          className="text-xs text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
        >
          Sign out
        </button>
      </div>

      {/* ── Developer Tools ───────────────────────────────────────────── */}
      {user?.is_superuser && (
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white mb-4">Developer Tools</h2>
          <div className="space-y-3 divide-y divide-zinc-100 dark:divide-zinc-800">
            {[
              { label: "API Docs (Swagger)", desc: "FastAPI interactive documentation", href: "/api/docs" },
              { label: "Airflow UI",         desc: "DAG monitoring and manual triggers", href: "http://localhost:8080" },
              { label: "Grafana",            desc: "Internal metrics dashboard", href: "http://localhost:3000" },
            ].map(({ label, desc, href }) => (
              <div key={label} className="flex items-center justify-between pt-3 first:pt-0">
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-white">{label}</p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{desc}</p>
                </div>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-brand-500 hover:text-brand-600 font-medium ml-4 flex-shrink-0"
                >
                  Open ↗
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
