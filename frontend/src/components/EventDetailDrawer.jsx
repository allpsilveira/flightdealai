/**
 * EventDetailDrawer — left-side slide-in shown when the user clicks an event
 * in the Activity Timeline. Distinct from FareDetailPanel (the airline-row
 * modal): this is event-centric, not fare-centric.
 *
 * Loads /api/events/{id}/snapshot and renders:
 *   - Plain-English headline + one-line reason
 *   - Before / After tiles + delta
 *   - 14-day mini sparkline with the event marker
 *   - Scan snapshot — every airline at that scan moment
 *   - Actions toolbar (Save, Export PNG, Share, WhatsApp)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, ReferenceDot,
} from "recharts";
import api from "../lib/api";
import FormattedText from "./FormattedText";

const AIRLINE_NAME = {
  AA: "American Airlines",  UA: "United Airlines",   DL: "Delta Air Lines",
  CM: "Copa Airlines",      LA: "LATAM Airlines",    G3: "GOL",   AD: "Azul",
  AV: "Avianca",            BA: "British Airways",   AF: "Air France",
  LH: "Lufthansa",          KL: "KLM",               IB: "Iberia",
  TP: "TAP Air Portugal",   LX: "Swiss",             EK: "Emirates",
  QR: "Qatar Airways",      EY: "Etihad",            SQ: "Singapore Airlines",
  CX: "Cathay Pacific",     NH: "ANA",               JL: "JAL",
  AC: "Air Canada",
};

const airlineLogo = (code) =>
  code ? `https://images.kiwi.com/airlines/64/${code}.png` : null;

const EVENT_LABEL = {
  price_drop:          "Price drop",
  price_rise:          "Price rise",
  error_fare:          "Error fare",
  award_opened:        "Award available",
  award_closed:        "Award closed",
  airport_arbitrage:   "Airport savings",
  trend_reversal:      "Trend reversal",
  new_low:             "New low",
  stable:              "Stable",
  monitoring_started:  "Monitoring started",
  fare_brand_detected: "Fare brand",
  scarcity_alert:      "Scarcity",
  ai_insight:          "AI insight",
};

const SEVERITY_COLOR = {
  critical: "text-red-400 bg-red-500/15 border-red-500/30",
  high:     "text-emerald-400 bg-emerald-500/15 border-emerald-500/30",
  medium:   "text-amber-400 bg-amber-500/15 border-amber-500/30",
  low:      "text-champagne bg-champagne/15 border-champagne/30",
  info:     "text-zinc-400 bg-zinc-800/60 border-zinc-700",
};

const fmt = (n) => (n == null ? "—" : `$${Math.round(n).toLocaleString()}`);

function PriceTile({ label, value, sub }) {
  return (
    <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 px-4 py-3">
      <p className="text-2xs text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-serif text-zinc-100 tabular-nums mt-1">{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function DeltaPill({ delta }) {
  if (delta == null) return null;
  const negative = delta < 0;
  const color = negative
    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
    : delta > 0
    ? "bg-red-500/15 text-red-300 border-red-500/30"
    : "bg-zinc-800/60 text-zinc-400 border-zinc-700";
  const arrow = negative ? "▼" : delta > 0 ? "▲" : "—";
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${color}`}>
      {arrow} {fmt(Math.abs(delta))}
    </span>
  );
}

function MiniSparkline({ data, eventTime, eventPrice }) {
  if (!data || data.length < 2) {
    return (
      <div className="h-32 flex items-center justify-center text-xs text-zinc-500">
        Not enough history yet to draw a sparkline.
      </div>
    );
  }
  const series = data.map((d) => ({ ...d, ts: new Date(d.t).getTime() }));
  const eventTs = eventTime ? new Date(eventTime).getTime() : null;
  return (
    <div className="h-32 -mx-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <XAxis dataKey="ts" type="number" domain={["dataMin", "dataMax"]} hide />
          <YAxis dataKey="price" hide domain={["dataMin", "dataMax"]} />
          <Tooltip
            contentStyle={{ background: "#0a0a0a", border: "1px solid #27272a", borderRadius: 8, fontSize: 11 }}
            labelFormatter={(v) => format(new Date(v), "d MMM HH:mm")}
            formatter={(v) => [fmt(v), "Price"]}
          />
          <Line type="monotone" dataKey="price" stroke="#d4b483" strokeWidth={1.6} dot={false} isAnimationActive={false} />
          {eventTs && eventPrice != null && (
            <ReferenceDot x={eventTs} y={eventPrice} r={4} fill="#d4b483" stroke="#0a0a0a" strokeWidth={2} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function OfferRow({ offer, isWinner }) {
  const code = offer.primary_airline;
  const name = AIRLINE_NAME[code] ?? code ?? "Unknown";
  const stops = offer.stops === 0 ? "Direct" : `${offer.stops} stop${offer.stops > 1 ? "s" : ""}`;
  const dur = offer.duration_minutes
    ? `${Math.floor(offer.duration_minutes / 60)}h ${offer.duration_minutes % 60}m`
    : null;
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
        isWinner
          ? "bg-champagne/8 border-champagne/30"
          : "bg-zinc-900/40 border-zinc-800"
      }`}
    >
      {code ? (
        <img
          src={airlineLogo(code)} alt={code}
          className="w-7 h-7 rounded object-contain bg-white/95 border border-zinc-700 p-0.5 flex-shrink-0"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      ) : <div className="w-7 h-7 rounded bg-zinc-800 flex-shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-100 truncate leading-tight">{name}</p>
        <p className="text-2xs text-zinc-500 mt-0.5">
          {stops}{dur ? ` · ${dur}` : ""}
        </p>
      </div>
      <p className={`text-sm font-semibold tabular-nums flex-shrink-0 ${
        isWinner ? "text-champagne" : "text-zinc-200"
      }`}>
        {fmt(offer.price_usd)}
      </p>
    </div>
  );
}

export default function EventDetailDrawer({ eventId, onClose, onOpenFare }) {
  const [snap,    setSnap]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [saving,  setSaving]  = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [exporting, setExporting] = useState(false);
  const drawerRef = useRef(null);

  /* Esc to close */
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  /* Fetch snapshot */
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    setLoading(true); setError("");
    api.get(`/events/${eventId}/snapshot`)
      .then((r) => { if (!cancelled) setSnap(r.data); })
      .catch((e) => {
        if (!cancelled) {
          const raw = e.response?.data?.detail;
          const msg = typeof raw === "string" ? raw
            : Array.isArray(raw) ? raw.map((x) => x?.msg ?? "").join(", ")
            : (e.message ?? "Failed to load event.");
          setError(msg);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [eventId]);

  const event   = snap?.event;
  const deal    = snap?.deal;
  const offers  = snap?.offers ?? [];
  const winnerKey = useMemo(() => {
    if (!offers.length) return null;
    const min = Math.min(...offers.map((o) => o.price_usd));
    return offers.findIndex((o) => o.price_usd === min);
  }, [offers]);

  const sevColor = event ? (SEVERITY_COLOR[event.severity] ?? SEVERITY_COLOR.info) : SEVERITY_COLOR.info;
  const eventLabel = event ? (EVENT_LABEL[event.event_type] ?? event.event_type) : "";
  const ago = event?.timestamp ? formatDistanceToNow(parseISO(event.timestamp), { addSuffix: true }) : "";

  const handleExport = async () => {
    if (!drawerRef.current) return;
    setExporting(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(drawerRef.current, {
        cacheBust: true,
        backgroundColor: "#09090b",
        pixelRatio: 2,
      });
      const a = document.createElement("a");
      a.download = `flyluxurydeals-event-${eventId}.png`;
      a.href = dataUrl;
      a.click();
    } catch (e) {
      console.error("export failed", e);
    } finally {
      setExporting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post("/saved", { item_type: "event", item_id: String(eventId) });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    } catch (e) {
      // Fail silently — endpoint may not exist yet
      console.warn("save failed", e?.message);
    } finally {
      setSaving(false);
    }
  };

  const handleWhatsApp = async () => {
    try {
      await api.post("/alerts/test-whatsapp", { event_id: eventId });
    } catch (e) {
      console.warn("whatsapp failed", e?.message);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Left-side slide-in drawer */}
      <aside
        ref={drawerRef}
        className="fixed left-0 top-0 bottom-0 z-50 w-full sm:w-[28rem] lg:w-[32rem]
                   bg-zinc-950 border-r border-zinc-800 shadow-2xl overflow-y-auto
                   animate-slide-in-left"
        role="dialog"
        aria-label="Event details"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 px-6 pt-5 pb-4
                        bg-gradient-to-b from-zinc-900 to-zinc-950
                        border-b border-zinc-800">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {event && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-2xs
                                  font-semibold uppercase tracking-wide border ${sevColor}`}>
                  {eventLabel}
                </span>
              )}
              <p className="text-2xs text-zinc-500 mt-2">{ago}</p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 flex items-center justify-center rounded-full
                         bg-zinc-800/60 text-zinc-400 hover:text-zinc-100
                         hover:bg-zinc-700 transition-colors text-sm flex-shrink-0"
            >✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-6">
          {loading && (
            <div className="space-y-4 animate-pulse">
              <div className="h-6 bg-zinc-800 rounded w-3/4" />
              <div className="h-4 bg-zinc-800 rounded w-full" />
              <div className="h-4 bg-zinc-800 rounded w-5/6" />
              <div className="h-32 bg-zinc-800 rounded" />
            </div>
          )}

          {error && !loading && (
            <p className="text-xs text-red-400 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
              {error}
            </p>
          )}

          {!loading && !error && snap && (
            <>
              {/* Headline + reason */}
              <div>
                <h2 className="font-serif text-xl text-zinc-100 leading-snug">
                  {snap.headline}
                </h2>
                {snap.reason && (
                  <div className="mt-2">
                    <FormattedText
                      text={snap.reason}
                      className="[&_p]:text-sm [&_p]:text-zinc-400 [&_p]:leading-relaxed [&_li]:text-sm"
                    />
                  </div>
                )}
              </div>

              {/* Before / After tiles */}
              {(event?.price_usd != null || event?.previous_price_usd != null) && (
                <div>
                  <p className="text-2xs font-semibold text-zinc-500 uppercase tracking-[0.15em] mb-3">
                    Before · After
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <PriceTile
                      label="Was"
                      value={fmt(event.previous_price_usd)}
                      sub="prior scan"
                    />
                    <PriceTile
                      label="Now"
                      value={fmt(event.price_usd)}
                      sub={event.airline ? `via ${event.airline}` : null}
                    />
                  </div>
                  {snap.delta_usd != null && (
                    <div className="mt-3 flex justify-end">
                      <DeltaPill delta={snap.delta_usd} />
                    </div>
                  )}
                </div>
              )}

              {/* 14-day sparkline */}
              <div>
                <p className="text-2xs font-semibold text-zinc-500 uppercase tracking-[0.15em] mb-2">
                  14-day window
                </p>
                <MiniSparkline
                  data={snap.sparkline}
                  eventTime={event?.timestamp}
                  eventPrice={event?.price_usd}
                />
              </div>

              {/* Scan snapshot — all airlines at that moment */}
              {offers.length > 0 && (
                <div>
                  <p className="text-2xs font-semibold text-zinc-500 uppercase tracking-[0.15em] mb-3">
                    Scan snapshot · {offers.length} airline{offers.length > 1 ? "s" : ""}
                  </p>
                  <div className="space-y-2">
                    {offers.slice(0, 8).map((o, i) => (
                      <OfferRow key={`${o.primary_airline}-${o.stops}-${i}`} offer={o} isWinner={i === winnerKey} />
                    ))}
                  </div>
                </div>
              )}

              {/* Open the related fare panel (when event has a linked deal) */}
              {deal?.id && onOpenFare && (
                <button
                  onClick={() => onOpenFare(deal.id)}
                  className="w-full px-4 py-2.5 rounded-lg border border-champagne/30
                             bg-champagne/5 text-champagne text-sm font-medium
                             hover:bg-champagne/10 transition-colors"
                >
                  Open fare details →
                </button>
              )}
            </>
          )}
        </div>

        {/* Actions toolbar */}
        {!loading && !error && snap && (
          <div className="sticky bottom-0 z-10 px-6 py-4 bg-zinc-950/95 backdrop-blur-sm
                          border-t border-zinc-800 flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-3 py-2 rounded-lg border border-zinc-800
                         text-xs text-zinc-300 hover:text-champagne
                         hover:border-champagne/40 transition-colors disabled:opacity-50"
            >
              {savedOk ? "✓ Saved" : saving ? "Saving…" : "★ Save"}
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex-1 px-3 py-2 rounded-lg border border-zinc-800
                         text-xs text-zinc-300 hover:text-champagne
                         hover:border-champagne/40 transition-colors disabled:opacity-50"
            >
              {exporting ? "…" : "Export PNG"}
            </button>
            <button
              onClick={handleWhatsApp}
              className="flex-1 px-3 py-2 rounded-lg border border-zinc-800
                         text-xs text-zinc-300 hover:text-emerald-400
                         hover:border-emerald-500/40 transition-colors"
            >
              WhatsApp
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
