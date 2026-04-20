import { useEffect, useState } from "react";
import { useAuthStore } from "../stores/useAuth";
import { useSettingsStore } from "../stores/useSettings";
import { useWebPush } from "../hooks/useWebPush";
import api from "../lib/api";

const TABS = [
  { id: "account",       label: "Account",       desc: "Email, language, password" },
  { id: "notifications", label: "Notifications", desc: "WhatsApp, browser push, email" },
  { id: "display",       label: "Display",       desc: "Currency, date format" },
  { id: "usage",         label: "API Usage",     desc: "Costs and call volume" },
  { id: "developer",     label: "Developer",     desc: "Internal tools and links", superuserOnly: true },
];

export default function Settings() {
  const user       = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const logout     = useAuthStore((s) => s.logout);

  const [activeTab, setActiveTab] = useState("account");
  const visibleTabs = TABS.filter((t) => !t.superuserOnly || user?.is_superuser);

  return (
    <div className="px-6 lg:px-10 py-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-serif text-champagne tracking-tight">Settings</h1>
        <p className="text-sm text-zinc-400 mt-1.5 font-light">Account preferences and notification setup.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">
        {/* Left nav */}
        <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible -mx-6 lg:mx-0 px-6 lg:px-0">
          {visibleTabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`text-left px-4 py-3 rounded-lg transition-all flex-shrink-0 lg:w-full
                  ${active
                    ? "bg-champagne/10 border border-champagne/30 text-champagne"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40 border border-transparent"
                  }`}
              >
                <div className="text-sm font-medium">{tab.label}</div>
                <div className="text-xs text-zinc-500 mt-0.5 hidden lg:block">{tab.desc}</div>
              </button>
            );
          })}
          <button
            onClick={logout}
            className="text-left px-4 py-3 rounded-lg transition-all flex-shrink-0 lg:w-full lg:mt-6
                       text-zinc-500 hover:text-red-400 hover:bg-red-500/5 border border-transparent"
          >
            <div className="text-sm font-medium">Sign out</div>
            <div className="text-xs text-zinc-600 mt-0.5 hidden lg:block">End this session</div>
          </button>
        </nav>

        {/* Right content */}
        <div className="min-w-0">
          {activeTab === "account"       && <AccountTab       user={user} updateUser={updateUser} />}
          {activeTab === "notifications" && <NotificationsTab user={user} updateUser={updateUser} />}
          {activeTab === "display"       && <DisplayTab />}
          {activeTab === "usage"         && <ApiUsageTab />}
          {activeTab === "developer"     && user?.is_superuser && <DeveloperTab />}
        </div>
      </div>
    </div>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Account â”€â”€ */

function AccountTab({ user, updateUser }) {
  const [language, setLanguage] = useState(user?.language ?? "en");
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState("");

  const save = async () => {
    setSaving(true); setError("");
    try {
      await api.patch("/auth/me", { language });
      updateUser({ language });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.response?.data?.detail ?? "Failed to save.");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <Card title="Account">
        <Field label="Email">
          <input className="input opacity-60 cursor-not-allowed" value={user?.email ?? ""} disabled readOnly />
        </Field>
        <Field label="Language" hint="AI recommendations and alerts will be delivered in this language.">
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="input">
            <option value="en">English ðŸ‡ºðŸ‡¸</option>
            <option value="es">EspaÃ±ol ðŸ‡ªðŸ‡¸</option>
            <option value="pt">PortuguÃªs ðŸ‡§ðŸ‡·</option>
          </select>
        </Field>
        <SaveBar onSave={save} saving={saving} saved={saved} error={error} />
      </Card>
    </div>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Notifications â”€â”€ */

function NotificationsTab({ user, updateUser }) {
  const { supported: pushSupported, subscribed, loading: pushLoading, error: pushError, subscribe, unsubscribe } = useWebPush();

  const [whatsapp, setWhatsapp] = useState(user?.whatsapp_number ?? "");
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState("");
  const [testing,  setTesting]  = useState(false);
  const [testMsg,  setTestMsg]  = useState("");

  const save = async () => {
    setSaving(true); setError("");
    try {
      await api.patch("/auth/me", { whatsapp_number: whatsapp || null });
      updateUser({ whatsapp_number: whatsapp || null });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.response?.data?.detail ?? "Failed to save.");
    } finally { setSaving(false); }
  };

  const sendTest = async () => {
    setTesting(true); setTestMsg("");
    try {
      await api.post("/alerts/test-whatsapp");
      setTestMsg("Test message sent â€” check WhatsApp.");
    } catch (err) {
      setTestMsg(err.response?.data?.detail ?? "Failed to send test.");
    } finally {
      setTesting(false);
      setTimeout(() => setTestMsg(""), 5000);
    }
  };

  return (
    <div className="space-y-6">
      {pushSupported && (
        <Card title="Browser Notifications" subtitle="Receive deal alerts in this browser, even when the tab is closed.">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-100">
                {subscribed ? "Notifications enabled" : "Notifications disabled"}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {subscribed ? "This browser will receive deal alerts." : "Click Enable to allow notifications."}
              </p>
              {pushError && <p className="text-xs text-red-400 mt-1">{pushError}</p>}
            </div>
            <button
              onClick={subscribed ? unsubscribe : subscribe}
              disabled={pushLoading}
              className={subscribed ? "btn-ghost text-xs py-1.5 px-3" : "btn-primary text-xs py-1.5 px-3"}
            >
              {pushLoading ? "â€¦" : subscribed ? "Disable" : "Enable"}
            </button>
          </div>
        </Card>
      )}

      <Card title="WhatsApp Alerts" subtitle="Deal alerts and a weekly briefing every Monday at 7 AM.">
        <Field label="Phone Number" hint="International format â€” e.g. +12392221234. Powered by Twilio WhatsApp Business.">
          <input
            type="tel"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            className="input"
            placeholder="+1 (239) 000-0000"
          />
        </Field>
        <div className="flex items-center gap-3 pt-2">
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? "Savingâ€¦" : saved ? "Saved âœ“" : "Save Number"}
          </button>
          {whatsapp && (
            <button onClick={sendTest} disabled={testing} className="btn-ghost text-xs">
              {testing ? "Sendingâ€¦" : "Send test message"}
            </button>
          )}
          {testMsg && <span className="text-xs text-zinc-400">{testMsg}</span>}
        </div>
        {error && <ErrorBanner>{error}</ErrorBanner>}
      </Card>
    </div>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Display â”€â”€ */

function DisplayTab() {
  const currency      = useSettingsStore((s) => s.currency);
  const dateFormat    = useSettingsStore((s) => s.dateFormat);
  const setCurrency   = useSettingsStore((s) => s.setCurrency);
  const setDateFormat = useSettingsStore((s) => s.setDateFormat);
  const [saved, setSaved] = useState(false);

  const onChange = (fn) => (e) => {
    fn(e.target.value);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <Card title="Display Preferences" subtitle="Affects how prices and dates are shown across the app. Stored locally in this browser.">
      <Field label="Currency" hint="Backend stores all prices in USD; conversion happens at display time (Phase 8.13).">
        <select value={currency} onChange={onChange(setCurrency)} className="input">
          <option value="USD">USD â€” US Dollar</option>
          <option value="BRL">BRL â€” Brazilian Real</option>
          <option value="EUR">EUR â€” Euro</option>
          <option value="GBP">GBP â€” Pound Sterling</option>
        </select>
      </Field>
      <Field label="Date Format">
        <select value={dateFormat} onChange={onChange(setDateFormat)} className="input">
          <option value="MM/DD/YYYY">MM/DD/YYYY (US)</option>
          <option value="DD/MM/YYYY">DD/MM/YYYY (Europe / BR)</option>
          <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
        </select>
      </Field>
      {saved && <p className="text-xs text-emerald-400">Saved âœ“</p>}
    </Card>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ API Usage â”€â”€ */

function ApiUsageTab() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [days,    setDays]    = useState(30);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get(`/intelligence/usage?days=${days}`)
      .then((r) => { if (!cancelled) setData(r.data); })
      .catch((e) => { if (!cancelled) setError(e.response?.data?.detail ?? "Failed to load usage."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  if (loading) return <Card title="API Usage"><p className="text-sm text-zinc-500">Loadingâ€¦</p></Card>;
  if (error)   return <Card title="API Usage"><ErrorBanner>{error}</ErrorBanner></Card>;
  if (!data)   return null;

  const totalCost  = (data.by_source ?? []).reduce((s, r) => s + (r.cost_usd || 0), 0);
  const totalCalls = (data.by_source ?? []).reduce((s, r) => s + (r.calls    || 0), 0);

  return (
    <div className="space-y-6">
      <Card title="API Usage" subtitle={`Last ${days} days across all data sources.`}>
        <div className="flex items-center gap-2 mb-5">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`text-xs px-3 py-1.5 rounded-lg transition-all
                ${days === d
                  ? "bg-champagne/15 text-champagne border border-champagne/30"
                  : "text-zinc-500 border border-zinc-700 hover:text-zinc-300"
                }`}
            >
              {d}d
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <Stat label="Total cost" value={`$${totalCost.toFixed(2)}`} hint={`${days}-day window`} />
          <Stat label="Total calls" value={totalCalls.toLocaleString()} hint={`avg ${(totalCalls / days).toFixed(0)}/day`} />
        </div>

        <div className="space-y-2">
          {(data.by_source ?? []).map((row) => {
            const todayCount = data.today_by_source?.[row.source] ?? 0;
            const quota      = data.quotas?.[row.source];
            const quotaPct   = quota?.limit ? (todayCount / quota.limit) * 100 : null;
            return (
              <div key={row.source} className="flex items-center justify-between p-4 rounded-lg bg-zinc-900/40 border border-zinc-800">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-100 capitalize">{row.source.replace(/_/g, " ")}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {row.calls.toLocaleString()} calls Â· {row.avg_latency_ms ? `${Math.round(row.avg_latency_ms)}ms avg` : "â€”"}
                    {quota?.limit && ` Â· today ${todayCount}/${quota.limit} (${quota.period})`}
                  </p>
                  {quotaPct !== null && (
                    <div className="mt-2 h-1 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className={`h-full transition-all ${quotaPct > 80 ? "bg-red-500" : quotaPct > 50 ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${Math.min(100, quotaPct)}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="text-right ml-4">
                  <p className="text-sm font-mono text-champagne">${row.cost_usd.toFixed(2)}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{days}d total</p>
                </div>
              </div>
            );
          })}
          {(!data.by_source || data.by_source.length === 0) && (
            <p className="text-sm text-zinc-500 text-center py-6">No API calls recorded yet in this window.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Developer â”€â”€ */

function DeveloperTab() {
  const links = [
    { label: "API Docs (Swagger)", desc: "FastAPI interactive documentation", href: "/api/docs" },
    { label: "Airflow UI",         desc: "DAG monitoring and manual triggers", href: "http://localhost:8080" },
    { label: "Grafana",            desc: "Internal metrics dashboard",        href: "http://localhost:3000" },
  ];
  return (
    <Card title="Developer Tools" subtitle="Internal tooling, only visible to superusers.">
      <div className="space-y-3 divide-y divide-zinc-800">
        {links.map(({ label, desc, href }) => (
          <div key={label} className="flex items-center justify-between pt-3 first:pt-0">
            <div>
              <p className="text-sm font-medium text-zinc-100">{label}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{desc}</p>
            </div>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-champagne hover:text-champagne/80 font-medium ml-4 flex-shrink-0"
            >
              Open â†—
            </a>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Helpers â”€â”€ */

function Card({ title, subtitle, children }) {
  return (
    <section className="card p-6">
      <h2 className="text-base font-serif text-champagne mb-1">{title}</h2>
      {subtitle && <p className="text-xs text-zinc-500 mb-5 font-light">{subtitle}</p>}
      {!subtitle && <div className="mb-5" />}
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="label block mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-zinc-500 mt-1.5 font-light">{hint}</p>}
    </div>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-lg bg-zinc-900/40 border border-zinc-800 p-4">
      <p className="text-xs text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-serif text-champagne mt-1">{value}</p>
      {hint && <p className="text-xs text-zinc-600 mt-0.5">{hint}</p>}
    </div>
  );
}

function SaveBar({ onSave, saving, saved, error }) {
  return (
    <div>
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <button onClick={onSave} disabled={saving} className="btn-primary mt-2">
        {saving ? "Savingâ€¦" : saved ? "Saved âœ“" : "Save Changes"}
      </button>
    </div>
  );
}

function ErrorBanner({ children }) {
  return (
    <p className="text-xs text-red-400 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
      {children}
    </p>
  );
}
