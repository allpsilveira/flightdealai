import { useEffect, useState } from "react";
import { useAuthStore } from "../stores/useAuth";
import { useSettingsStore } from "../stores/useSettings";
import { useWebPush } from "../hooks/useWebPush";
import api from "../lib/api";

/* ===================================================================== */
/*  Settings — single scrolling page, anchored sections                  */
/* ===================================================================== */

const SECTIONS = [
  { id: "account",       label: "Account" },
  { id: "notifications", label: "Notifications" },
  { id: "display",       label: "Display" },
  { id: "usage",         label: "API Usage" },
  { id: "developer",     label: "Developer", superuserOnly: true },
];

export default function Settings() {
  const user = useAuthStore((s) => s.user);

  const visible = SECTIONS.filter((s) => !s.superuserOnly || user?.is_superuser);

  return (
    <div className="px-6 lg:px-10 py-10 max-w-4xl mx-auto">
      {/* Page header */}
      <header className="mb-10">
        <h1 className="font-serif text-4xl text-champagne tracking-tight">Settings</h1>
        <p className="text-sm text-zinc-400 mt-2 font-light">
          Account preferences, notifications, and integrations.
        </p>
      </header>

      {/* Section quick-jump (sticky on desktop) */}
      <nav className="mb-10 flex flex-wrap gap-2 pb-4 border-b border-zinc-800/60">
        {visible.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="text-xs px-3 py-1.5 rounded-full border border-zinc-800 text-zinc-400
                       hover:text-champagne hover:border-champagne/40 transition-colors"
          >
            {s.label}
          </a>
        ))}
      </nav>

      <div className="space-y-12">
        <AccountSection />
        <NotificationsSection />
        <DisplaySection />
        <ApiUsageSection />
        {user?.is_superuser && <DeveloperSection />}
        <SignOutFooter />
      </div>
    </div>
  );
}

/* =====================================================================
   Section: Account
   ===================================================================== */

function AccountSection() {
  const user       = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  const [language, setLanguage] = useState(user?.language ?? "en");
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState("");

  const dirty = language !== (user?.language ?? "en");

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
    <Section id="account" title="Account" subtitle="Login details and preferred language.">
      <Field label="Email">
        <input
          className="input opacity-60 cursor-not-allowed"
          value={user?.email ?? ""}
          disabled
          readOnly
        />
      </Field>

      <Field label="Language" hint="AI recommendations and alerts will be delivered in this language.">
        <select value={language} onChange={(e) => setLanguage(e.target.value)} className="input">
          <option value="en">English (United States)</option>
          <option value="es">Espanol (Espana)</option>
          <option value="pt">Portugues (Brasil)</option>
        </select>
      </Field>

      <SaveBar onSave={save} saving={saving} saved={saved} error={error} disabled={!dirty} />
    </Section>
  );
}

/* =====================================================================
   Section: Notifications
   ===================================================================== */

function NotificationsSection() {
  const user       = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const {
    supported: pushSupported, subscribed,
    loading:   pushLoading,   error: pushError,
    subscribe, unsubscribe,
  } = useWebPush();

  const [whatsapp, setWhatsapp] = useState(user?.whatsapp_number ?? "");
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState("");
  const [testing,  setTesting]  = useState(false);
  const [testMsg,  setTestMsg]  = useState("");

  const dirty = (whatsapp || "") !== (user?.whatsapp_number ?? "");

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
      setTestMsg("Test message sent — check WhatsApp.");
    } catch (err) {
      setTestMsg(err.response?.data?.detail ?? "Failed to send test.");
    } finally {
      setTesting(false);
      setTimeout(() => setTestMsg(""), 5000);
    }
  };

  return (
    <Section id="notifications" title="Notifications" subtitle="Where and how alerts reach you.">
      {/* Browser push */}
      <SubGroup title="Browser notifications" desc="Receive deal alerts in this browser even when the tab is closed.">
        {pushSupported ? (
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-zinc-100">
                {subscribed ? "Notifications enabled" : "Notifications disabled"}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {subscribed
                  ? "This browser will receive deal alerts."
                  : "Click Enable to allow notifications."}
              </p>
              {pushError && <p className="text-xs text-red-400 mt-1">{pushError}</p>}
            </div>
            <button
              onClick={subscribed ? unsubscribe : subscribe}
              disabled={pushLoading}
              className={subscribed ? "btn-ghost text-xs py-2 px-3" : "btn-primary text-xs py-2 px-3"}
            >
              {pushLoading ? "..." : subscribed ? "Disable" : "Enable"}
            </button>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">
            This browser does not support web push. Try Chrome, Edge, or Firefox on desktop.
          </p>
        )}
      </SubGroup>

      {/* WhatsApp */}
      <SubGroup title="WhatsApp alerts" desc="Deal alerts and a weekly briefing every Monday at 7 AM.">
        <Field label="Phone number" hint="International format, e.g. +12392221234. Powered by Twilio WhatsApp Business.">
          <input
            type="tel"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            className="input"
            placeholder="+1 (239) 000-0000"
          />
        </Field>
        <div className="flex items-center gap-3 pt-2 flex-wrap">
          <button onClick={save} disabled={saving || !dirty} className="btn-primary text-xs py-2 px-4 disabled:opacity-50">
            {saving ? "Saving..." : saved ? "Saved" : "Save number"}
          </button>
          {whatsapp && !dirty && (
            <button onClick={sendTest} disabled={testing} className="btn-ghost text-xs py-2 px-3">
              {testing ? "Sending..." : "Send test message"}
            </button>
          )}
          {testMsg && <span className="text-xs text-zinc-400">{testMsg}</span>}
        </div>
        {error && <ErrorBanner>{error}</ErrorBanner>}
      </SubGroup>
    </Section>
  );
}

/* =====================================================================
   Section: Display
   ===================================================================== */

function DisplaySection() {
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
    <Section
      id="display"
      title="Display"
      subtitle="Affects how prices and dates are shown across the app. Stored locally in this browser."
    >
      <Field label="Currency" hint="Backend stores all prices in USD; conversion happens at display time.">
        <select value={currency} onChange={onChange(setCurrency)} className="input">
          <option value="USD">USD - US Dollar</option>
          <option value="BRL">BRL - Brazilian Real</option>
          <option value="EUR">EUR - Euro</option>
          <option value="GBP">GBP - Pound Sterling</option>
        </select>
      </Field>
      <Field label="Date format">
        <select value={dateFormat} onChange={onChange(setDateFormat)} className="input">
          <option value="MM/DD/YYYY">MM/DD/YYYY (US)</option>
          <option value="DD/MM/YYYY">DD/MM/YYYY (Europe / Brazil)</option>
          <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
        </select>
      </Field>
      {saved && <p className="text-xs text-emerald-400">Saved</p>}
    </Section>
  );
}

/* =====================================================================
   Section: API Usage
   ===================================================================== */

function ApiUsageSection() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [days,    setDays]    = useState(30);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    api.get(`/intelligence/usage?days=${days}`)
      .then((r) => { if (!cancelled) setData(r.data); })
      .catch((e) => {
        if (!cancelled) {
          const msg = e.response?.data?.detail ?? e.message ?? "Failed to load usage.";
          setError(msg);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  const totalCost  = (data?.by_source ?? []).reduce((s, r) => s + (r.cost_usd || 0), 0);
  const totalCalls = (data?.by_source ?? []).reduce((s, r) => s + (r.calls    || 0), 0);

  return (
    <Section
      id="usage"
      title="API Usage"
      subtitle="Cost and call volume across SerpApi, Duffel, Seats.aero, Anthropic, and Twilio."
      headerRight={
        <div className="flex items-center gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`text-xs px-3 py-1.5 rounded-lg transition-all
                ${days === d
                  ? "bg-champagne/15 text-champagne border border-champagne/30"
                  : "text-zinc-500 border border-zinc-800 hover:text-zinc-300 hover:border-zinc-700"
                }`}
            >
              {d}d
            </button>
          ))}
        </div>
      }
    >
      {loading && <p className="text-sm text-zinc-500">Loading...</p>}

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Total cost"  value={`$${totalCost.toFixed(2)}`} hint={`${days}-day window`} />
            <Stat label="Total calls" value={totalCalls.toLocaleString()} hint={`avg ${(totalCalls / days).toFixed(0)}/day`} />
          </div>

          {(data.by_source ?? []).length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-6">
              No API calls recorded yet in this window.
            </p>
          ) : (
            <div className="space-y-2">
              {data.by_source.map((row) => {
                const todayCount = data.today_by_source?.[row.source] ?? 0;
                const quota      = data.quotas?.[row.source];
                const quotaPct   = quota?.limit ? (todayCount / quota.limit) * 100 : null;
                return (
                  <div
                    key={row.source}
                    className="flex items-center justify-between gap-4 p-4 rounded-lg
                               bg-zinc-900/40 border border-zinc-800"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-100 capitalize">
                        {row.source.replace(/_/g, " ")}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {row.calls.toLocaleString()} calls
                        {" · "}
                        {row.avg_latency_ms ? `${Math.round(row.avg_latency_ms)}ms avg` : "no latency data"}
                        {quota?.limit && ` · today ${todayCount}/${quota.limit} (${quota.period})`}
                      </p>
                      {quotaPct !== null && (
                        <div className="mt-2 h-1 rounded-full bg-zinc-800 overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              quotaPct > 80 ? "bg-red-500" :
                              quotaPct > 50 ? "bg-amber-500" :
                                              "bg-emerald-500"
                            }`}
                            style={{ width: `${Math.min(100, quotaPct)}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-mono text-champagne">${row.cost_usd.toFixed(2)}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{days}d total</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </Section>
  );
}

/* =====================================================================
   Section: Developer (superuser only)
   ===================================================================== */

function DeveloperSection() {
  const links = [
    { label: "API Docs (Swagger)", desc: "FastAPI interactive documentation",  href: "/api/docs" },
    { label: "Airflow UI",         desc: "DAG monitoring and manual triggers", href: "http://localhost:8080" },
    { label: "Grafana",            desc: "Internal metrics dashboard",         href: "http://localhost:3000" },
  ];
  return (
    <Section id="developer" title="Developer" subtitle="Internal tooling, only visible to superusers.">
      <div className="divide-y divide-zinc-800">
        {links.map(({ label, desc, href }) => (
          <div key={label} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
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
              Open →
            </a>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* =====================================================================
   Footer: Sign out
   ===================================================================== */

function SignOutFooter() {
  const logout = useAuthStore((s) => s.logout);
  return (
    <div className="pt-6 border-t border-zinc-800/60 flex items-center justify-between">
      <p className="text-xs text-zinc-500">End your session on this device.</p>
      <button
        onClick={logout}
        className="text-xs text-zinc-400 hover:text-red-400 transition-colors px-3 py-2"
      >
        Sign out
      </button>
    </div>
  );
}

/* =====================================================================
   Reusable building blocks
   ===================================================================== */

function Section({ id, title, subtitle, headerRight, children }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="flex items-end justify-between gap-4 mb-4">
        <div className="min-w-0">
          <h2 className="font-serif text-xl text-champagne">{title}</h2>
          {subtitle && <p className="text-xs text-zinc-500 mt-1 font-light">{subtitle}</p>}
        </div>
        {headerRight && <div className="flex-shrink-0">{headerRight}</div>}
      </div>
      <div className="card p-6 space-y-5">{children}</div>
    </section>
  );
}

function SubGroup({ title, desc, children }) {
  return (
    <div className="space-y-3 pb-5 border-b border-zinc-800/60 last:border-b-0 last:pb-0">
      <div>
        <h3 className="text-sm font-medium text-zinc-100">{title}</h3>
        {desc && <p className="text-xs text-zinc-500 mt-0.5 font-light">{desc}</p>}
      </div>
      {children}
    </div>
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

function SaveBar({ onSave, saving, saved, error, disabled }) {
  return (
    <div>
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <button
        onClick={onSave}
        disabled={saving || disabled}
        className="btn-primary text-xs py-2 px-4 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? "Saving..." : saved ? "Saved" : "Save changes"}
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
