import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { format } from "date-fns";

// Use a bare axios instance — share endpoint is public, no auth header needed.
const apiBase = import.meta.env.VITE_API_URL ?? "/api";

export default function ShareView() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await axios.get(`${apiBase}/share/${token}`);
        if (!cancelled) setData(r.data);
      } catch (e) {
        if (!cancelled) setError(e?.response?.data?.detail || e?.message || "Link not available");
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-zinc-100">
      <header className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
        <Link to="/" className="font-serif text-xl text-champagne">FlyLuxuryDeals</Link>
        <span className="text-[11px] uppercase tracking-wider text-zinc-500">Shared snapshot</span>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {error && (
          <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-5 py-4 text-rose-200">
            {error}
          </div>
        )}

        {!error && !data && (
          <div className="text-zinc-500 text-sm">Loading…</div>
        )}

        {data && <SnapshotCard payload={data} />}

        <p className="mt-10 text-center text-xs text-zinc-600">
          This is a read-only snapshot captured at the moment it was shared. Live prices may differ.
        </p>
      </main>
    </div>
  );
}

function SnapshotCard({ payload }) {
  const { item_type, snapshot: s = {}, view_count, expires_at } = payload;

  if (item_type === "deal") {
    return (
      <article className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8">
        <div className="text-[11px] uppercase tracking-wider text-champagne/70 mb-1">Deal snapshot</div>
        <h1 className="font-serif text-3xl text-zinc-50">
          {s.origin} → {s.destination}
        </h1>
        <div className="text-sm text-zinc-400 mt-1">
          {[s.cabin_class, s.airline_code, s.departure_date && format(new Date(s.departure_date), "MMM d, yyyy")]
            .filter(Boolean).join(" · ")}
        </div>

        <div className="mt-6 flex items-baseline gap-3">
          <div className="text-5xl font-serif text-champagne">
            ${s.best_price_usd ? Math.round(s.best_price_usd).toLocaleString() : "—"}
          </div>
          {s.score_total != null && (
            <span className="text-sm text-zinc-400">score {s.score_total.toFixed(1)}/10</span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {s.action && <Tag>{s.action}</Tag>}
          {s.is_gem && <Tag tone="gold">Gem</Tag>}
          {s.is_error_fare && <Tag tone="rose">Error fare</Tag>}
        </div>

        <Footer captured={s.captured_at} expires={expires_at} views={view_count} />
      </article>
    );
  }

  if (item_type === "event") {
    return (
      <article className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8">
        <div className="text-[11px] uppercase tracking-wider text-champagne/70 mb-1">Event snapshot</div>
        <h1 className="font-serif text-2xl text-zinc-50">{s.headline}</h1>
        {s.detail && <p className="text-sm text-zinc-300 mt-2">{s.detail}</p>}
        {s.subtext && <p className="text-xs text-zinc-500 mt-1">{s.subtext}</p>}

        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          {s.event_type && <Field label="Type" value={s.event_type} />}
          {s.severity && <Field label="Severity" value={s.severity} />}
          {s.airline && <Field label="Airline" value={s.airline} />}
          {s.price_usd && <Field label="Price" value={`$${Math.round(s.price_usd).toLocaleString()}`} />}
          {s.previous_price_usd && <Field label="Previous" value={`$${Math.round(s.previous_price_usd).toLocaleString()}`} />}
          {s.timestamp && <Field label="When" value={format(new Date(s.timestamp), "MMM d, h:mm a")} />}
        </div>

        <Footer captured={s.captured_at} expires={expires_at} views={view_count} />
      </article>
    );
  }

  if (item_type === "route") {
    return (
      <article className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8">
        <div className="text-[11px] uppercase tracking-wider text-champagne/70 mb-1">Route snapshot</div>
        <h1 className="font-serif text-3xl text-zinc-50">
          {(s.origins || []).join("/")} → {(s.destinations || []).join("/")}
        </h1>
        {s.cabin_classes?.length > 0 && (
          <div className="text-sm text-zinc-400 mt-1">{s.cabin_classes.join(", ")}</div>
        )}
        <Footer captured={s.captured_at} expires={expires_at} views={view_count} />
      </article>
    );
  }

  return <pre className="text-xs text-zinc-500">{JSON.stringify(payload, null, 2)}</pre>;
}

function Tag({ children, tone = "default" }) {
  const tones = {
    default: "bg-zinc-700/40 text-zinc-200 ring-zinc-500/30",
    gold: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
    rose: "bg-rose-500/15 text-rose-300 ring-rose-400/30",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>
      {children}
    </span>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="text-zinc-200">{value}</div>
    </div>
  );
}

function Footer({ captured, expires, views }) {
  return (
    <div className="mt-8 pt-4 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500">
      <span>Captured {captured ? format(new Date(captured), "MMM d, yyyy h:mm a") : "—"}</span>
      <span>
        {views ? `${views} view${views === 1 ? "" : "s"}` : ""}
        {expires && <> · expires {format(new Date(expires), "MMM d, yyyy")}</>}
      </span>
    </div>
  );
}
