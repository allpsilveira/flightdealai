import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine,
} from "recharts";
import api from "../lib/api";
import cabinQuality from "../data/cabin_quality.json";
import transferPartners from "../data/transfer_partners.json";
import loungeAccess from "../data/lounge_access.json";
import allAirports from "../data/airports.json";
import AirportComparisonMap from "./AirportComparisonMap";
import FormattedText from "./FormattedText";

/* ===================================================================== */
/*  Lookups & helpers                                                    */
/* ===================================================================== */

const airportMap = Object.fromEntries(allAirports.map((a) => [a.iata, a]));

const CABIN_LABEL = {
  BUSINESS: "Business", FIRST: "First Class", PREMIUM_ECONOMY: "Premium Economy",
};

const AIRLINE_NAME = {
  AA: "American Airlines", UA: "United Airlines", DL: "Delta Air Lines",
  WN: "Southwest",         B6: "JetBlue",         AS: "Alaska Airlines",
  F9: "Frontier",          NK: "Spirit",           CM: "Copa Airlines",
  AM: "Aeroméxico",        MX: "Mexicana",
  LA: "LATAM Airlines",    G3: "GOL",              AD: "Azul",
  JJ: "LATAM Brasil",      AV: "Avianca",          AR: "Aerolíneas Argentinas",
  H2: "Sky Airline",       JA: "JetSMART",
  BA: "British Airways",   AF: "Air France",       LH: "Lufthansa",
  KL: "KLM",               IB: "Iberia",           TP: "TAP Air Portugal",
  LX: "Swiss",             OS: "Austrian",          AZ: "ITA Airways",
  VS: "Virgin Atlantic",   TK: "Turkish Airlines",  SK: "SAS",
  AY: "Finnair",           EI: "Aer Lingus",        VY: "Vueling",
  EK: "Emirates",          QR: "Qatar Airways",    EY: "Etihad",
  ET: "Ethiopian Airlines",MS: "EgyptAir",         SA: "South African Airways",
  SQ: "Singapore Airlines",CX: "Cathay Pacific",   NH: "ANA",
  JL: "JAL",               TG: "Thai Airways",     MH: "Malaysia Airlines",
  OZ: "Asiana",            KE: "Korean Air",        CI: "China Airlines",
  BR: "EVA Air",           AI: "Air India",         GA: "Garuda Indonesia",
  AC: "Air Canada",        WS: "WestJet",           QF: "Qantas",
  NZ: "Air New Zealand",
};

const CABIN_BY_AIRLINE = cabinQuality.reduce((acc, e) => {
  if (!acc[e.airline_code]) acc[e.airline_code] = e;
  return acc;
}, {});

const airlineLogo = (code) =>
  code ? `https://images.kiwi.com/airlines/64/${code}.png` : null;

const fmtMins = (mins) => {
  if (!mins) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ===================================================================== */
/*  External-platform compare links                                      */
/*  Open the same route+date+cabin on each platform so you can verify    */
/*  the price we found is the real market floor.                         */
/* ===================================================================== */

function buildCompareLinks(deal) {
  if (!deal?.origin || !deal?.destination || !deal?.departure_date) return [];
  const o = deal.origin.toLowerCase();
  const d = deal.destination.toLowerCase();
  const oUp = deal.origin.toUpperCase();
  const dUp = deal.destination.toUpperCase();
  const date = deal.departure_date;          // YYYY-MM-DD
  const dateNoDash = date.replace(/-/g, ""); // YYYYMMDD
  const cabinSky    = { BUSINESS: "business", FIRST: "first", PREMIUM_ECONOMY: "premiumeconomy" }[deal.cabin_class] ?? "business";
  const cabinKayak  = { BUSINESS: "business", FIRST: "first", PREMIUM_ECONOMY: "premium" }[deal.cabin_class] ?? "business";
  const cabinLabel  = { BUSINESS: "business class", FIRST: "first class", PREMIUM_ECONOMY: "premium economy" }[deal.cabin_class] ?? "business class";
  const dateLabel   = format(new Date(date + "T12:00:00"), "MMMM d, yyyy");

  return [
    {
      name: "Google Flights", short: "Google", color: "#4285F4",
      href: `https://www.google.com/travel/flights?q=${encodeURIComponent(`${cabinLabel} flights ${oUp} to ${dUp} ${dateLabel}`)}`,
    },
    {
      name: "Skyscanner", short: "Skyscanner", color: "#0770e3",
      href: `https://www.skyscanner.com/transport/flights/${o}/${d}/${dateNoDash}/?cabin_class=${cabinSky}&adultsv2=1`,
    },
    {
      name: "Kayak", short: "Kayak", color: "#FF690F",
      href: `https://www.kayak.com/flights/${oUp}-${dUp}/${date}/${cabinKayak}`,
    },
    {
      name: "Booking.com", short: "Booking", color: "#003580",
      href: `https://flights.booking.com/flights/${oUp}.AIRPORT-${dUp}.AIRPORT/?type=ONEWAY&adults=1&cabinClass=${deal.cabin_class}&from=${oUp}.AIRPORT&to=${dUp}.AIRPORT&depart=${date}&sort=BEST`,
    },
    {
      name: "Expedia", short: "Expedia", color: "#FFC72C",
      href: `https://www.expedia.com/Flights-Search?leg1=from:${oUp},to:${dUp},departure:${format(new Date(date + "T12:00:00"), "MM/dd/yyyy")}TANYT&passengers=adults:1&trip=oneway&mode=search&cabinclass=${deal.cabin_class.toLowerCase()}`,
    },
  ];
}

/* ===================================================================== */
/*  Visualization #1 — Price-position bar                                */
/*  Plots this fare against Google's typical price range for the route.  */
/* ===================================================================== */

function PricePositionBar({ price, low, high, allTimeLow }) {
  if (!price || !low || !high || high <= low) return null;
  const pad = (high - low) * 0.15;
  const scaleLow  = Math.max(0, Math.min(low, price, allTimeLow ?? Infinity) - pad);
  const scaleHigh = Math.max(high, price) + pad;
  const span      = scaleHigh - scaleLow;
  const pos       = ((price - scaleLow) / span) * 100;
  const lowPos    = ((low - scaleLow) / span) * 100;
  const highPos   = ((high - scaleLow) / span) * 100;
  const lowMarker = allTimeLow ? ((allTimeLow - scaleLow) / span) * 100 : null;

  // Colour grades from green (cheap) to red (expensive)
  const color =
    price <= low                             ? "#10b981"   // emerald — below typical
    : price <= low + (high - low) * 0.33     ? "#84cc16"   // lime
    : price <= low + (high - low) * 0.66     ? "#f59e0b"   // amber
    :                                          "#ef4444";  // red

  return (
    <div className="space-y-2">
      <div className="relative h-3 rounded-full bg-zinc-800 overflow-hidden">
        {/* Typical range band */}
        <div
          className="absolute top-0 bottom-0 bg-gradient-to-r from-emerald-500/20 via-amber-500/20 to-red-500/20"
          style={{ left: `${lowPos}%`, width: `${highPos - lowPos}%` }}
        />
        {/* All-time low marker */}
        {lowMarker != null && (
          <div
            className="absolute top-0 bottom-0 w-px bg-emerald-400"
            style={{ left: `${lowMarker}%` }}
            title={`All-time low: $${Math.round(allTimeLow).toLocaleString()}`}
          />
        )}
        {/* Current price marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-zinc-950 shadow-lg"
          style={{ left: `${pos}%`, backgroundColor: color }}
        />
      </div>
      <div className="flex items-center justify-between text-2xs text-zinc-500 tabular-nums px-0.5">
        <span>${Math.round(low).toLocaleString()}</span>
        <span className="text-zinc-600">Google typical range</span>
        <span>${Math.round(high).toLocaleString()}</span>
      </div>
    </div>
  );
}

/* ===================================================================== */
/*  Visualization #2 — Score radar                                       */
/* ===================================================================== */

function ScoreRadar({ deal }) {
  // Normalize each sub-score to 0–100 for the radar
  const data = [
    { axis: "Percentile",   value: ((deal.score_percentile        ?? 0) / 30) * 100, raw: deal.score_percentile },
    { axis: "Z-score",      value: ((deal.score_zscore            ?? 0) / 20) * 100, raw: deal.score_zscore },
    { axis: "Trend align",  value: ((deal.score_trend_alignment   ?? 0) / 15) * 100, raw: deal.score_trend_alignment },
    { axis: "Trend dir",    value: ((deal.score_trend_direction   ?? 0) / 10) * 100, raw: deal.score_trend_direction },
    { axis: "Cross-source", value: ((deal.score_cross_source      ?? 0) / 20) * 100, raw: deal.score_cross_source },
    { axis: "Arbitrage",    value: ((deal.score_arbitrage         ?? 0) / 10) * 100, raw: deal.score_arbitrage },
    { axis: "Fare brand",   value: ((deal.score_fare_brand        ?? 0) / 10) * 100, raw: deal.score_fare_brand },
    { axis: "Scarcity",     value: ((deal.score_scarcity          ?? 0) / 5)  * 100, raw: deal.score_scarcity },
    { axis: "Award",        value: ((deal.score_award             ?? 0) / 50) * 100, raw: deal.score_award },
  ];

  return (
    <ResponsiveContainer width="100%" height={240}>
      <RadarChart data={data} outerRadius="78%">
        <PolarGrid stroke="#3f3f46" strokeOpacity={0.5} />
        <PolarAngleAxis
          dataKey="axis"
          tick={{ fill: "#a1a1aa", fontSize: 10, fontFamily: "inherit" }}
        />
        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
        <Radar
          dataKey="value"
          stroke="#d4af7a"
          fill="#d4af7a"
          fillOpacity={0.25}
          strokeWidth={1.5}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

/* ===================================================================== */
/*  Visualization #3 — Score donut                                       */
/* ===================================================================== */

function ScoreDonut({ score, max = 170 }) {
  const pct = Math.min(100, (score / max) * 100);
  const displayScore = Math.round((score / max) * 100);
  const r = 36;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  const color =
    displayScore >= 60 ? "#d4af7a"  // champagne
    : displayScore >= 40 ? "#84cc16" // lime
    : displayScore >= 20 ? "#f59e0b" // amber
    : "#52525b";                     // zinc — too thin to score

  return (
    <div className="relative w-24 h-24 flex-shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={r} stroke="#27272a" strokeWidth="8" fill="none" />
        <circle
          cx="50" cy="50" r={r}
          stroke={color} strokeWidth="8" fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-serif text-2xl text-champagne tabular-nums leading-none">{displayScore}</span>
        <span className="text-2xs text-zinc-500 mt-0.5">/ 100</span>
      </div>
    </div>
  );
}

/* ===================================================================== */
/*  Visualization #4 — Mini sparkline of recent prices                   */
/* ===================================================================== */

function PriceSparkline({ data, currentPrice, allTimeLow }) {
  if (!data || data.length < 2) return null;

  const series = data.map((d) => ({
    bucket: d.bucket,
    avg: Math.round(d.avg_price),
    min: Math.round(d.min_price),
  }));

  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={series} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <XAxis
          dataKey="bucket"
          tick={{ fontSize: 9, fill: "#71717a" }}
          tickFormatter={(v) => { try { return format(new Date(v), "d MMM"); } catch { return ""; } }}
          axisLine={false} tickLine={false}
        />
        <YAxis
          domain={["dataMin - 100", "dataMax + 100"]}
          tick={{ fontSize: 9, fill: "#71717a" }}
          tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
          axisLine={false} tickLine={false} width={40}
        />
        <Tooltip
          contentStyle={{ background: "#0a0a0a", border: "1px solid #27272a", borderRadius: 8, fontSize: 11 }}
          labelStyle={{ color: "#a1a1aa" }}
          formatter={(v) => [`$${Number(v).toLocaleString()}`, "Avg"]}
          labelFormatter={(v) => { try { return format(new Date(v), "EEE d MMM"); } catch { return v; } }}
        />
        {allTimeLow && (
          <ReferenceLine
            y={allTimeLow} stroke="#10b981" strokeDasharray="3 3" strokeOpacity={0.6}
            label={{ value: `Low $${Math.round(allTimeLow).toLocaleString()}`, fill: "#10b981", fontSize: 9, position: "insideBottomLeft" }}
          />
        )}
        {currentPrice && (
          <ReferenceLine y={currentPrice} stroke="#d4af7a" strokeDasharray="2 2" strokeOpacity={0.5} />
        )}
        <Line type="monotone" dataKey="avg" stroke="#d4af7a" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ===================================================================== */
/*  Main panel                                                           */
/* ===================================================================== */

export default function TicketDetailPanel({ deal, onClose, routeOrigins = [], dealsByOrigin = {} }) {
  const [offers,        setOffers]        = useState(null);
  const [enrichment,    setEnrichment]    = useState(null);
  const [history,       setHistory]       = useState(null);
  const [loadingOffers, setLoadingOffers] = useState(true);
  const [loadingEnrich, setLoadingEnrich] = useState(true);

  /* Close on Escape */
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  /* Fetch offers + enrichment + recent history */
  useEffect(() => {
    if (!deal) return;
    let cancelled = false;

    api.get(`/deals/${deal.id}/offers`)
      .then((r) => { if (!cancelled) setOffers(r.data); })
      .catch(() => { if (!cancelled) setOffers([]); })
      .finally(() => { if (!cancelled) setLoadingOffers(false); });

    api.get(`/deals/${deal.id}/enrichment`)
      .then((r) => { if (!cancelled) setEnrichment(r.data); })
      .catch(() => { if (!cancelled) setEnrichment({ duffel: null, awards: [] }); })
      .finally(() => { if (!cancelled) setLoadingEnrich(false); });

    api.get(`/prices/history/${deal.route_id}`, {
      params: {
        origin: deal.origin, destination: deal.destination,
        cabin_class: deal.cabin_class, days: 30,
      },
    })
      .then((r) => { if (!cancelled) setHistory(r.data); })
      .catch(() => { if (!cancelled) setHistory([]); });

    return () => { cancelled = true; };
  }, [deal?.id]);

  if (!deal) return null;

  /* Derived data */
  const originAp = airportMap[deal.origin];
  const destAp   = airportMap[deal.destination];
  const distKm   = originAp && destAp
    ? Math.round(haversineKm(originAp.lat, originAp.lon, destAp.lat, destAp.lon))
    : null;

  const bestOffer = offers?.[0] ?? null;
  const cabinInfo = CABIN_BY_AIRLINE[deal.airline_code] ?? null;
  const lounge    = loungeAccess[deal.airline_code] ?? null;
  const xfers     = transferPartners[deal.best_award_program] ?? [];
  const rec       = deal.ai_recommendation_en;
  const coldStart = deal.percentile_position == null && deal.zscore == null;

  const typicalMid  = deal.typical_price_low && deal.typical_price_high
    ? (deal.typical_price_low + deal.typical_price_high) / 2 : null;
  const savings     = typicalMid ? Math.round(typicalMid - deal.best_price_usd) : null;
  const savingsPct  = typicalMid && savings > 0 ? Math.round((savings / typicalMid) * 100) : null;

  const allTimeLow = useMemo(() => {
    if (!history?.length) return null;
    const mins = history.map((h) => h.min_price).filter(Boolean);
    return mins.length ? Math.min(...mins) : null;
  }, [history]);

  const compareLinks = useMemo(() => buildCompareLinks(deal), [deal]);

  const stops = bestOffer?.stops ?? (deal.is_direct ? 0 : null);
  const stopsLabel = stops === 0 ? "Direct"
    : stops != null ? `${stops} stop${stops > 1 ? "s" : ""}`
    : deal.is_direct ? "Direct" : "Connecting";

  /* Verification badge — replaces the "GEM" label that didn't really mean anything
     without Duffel. We treat a deal as "Verified low" when Google labels it `low`
     AND it sits below the typical-price band. Otherwise we show "Below typical"
     when it's measurably under the typical mid, or no badge at all.            */
  const verifBadge = (() => {
    if (deal.google_price_level === "low" && savings != null && savings > 0) {
      return { label: "VERIFIED LOW", tone: "emerald", tip: "Google flagged this as a low price AND it's below the typical range we've tracked." };
    }
    if (savingsPct != null && savingsPct >= 20) {
      return { label: "BELOW TYPICAL", tone: "champagne", tip: `${savingsPct}% under the typical range for this route.` };
    }
    if (deal.google_price_level === "low") {
      return { label: "GOOGLE: LOW", tone: "champagne", tip: "Google labelled this fare as low for this route." };
    }
    return null;
  })();
  const badgeColor = {
    emerald:   "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
    champagne: "bg-champagne/15 text-champagne border border-champagne/30",
  }[verifBadge?.tone] ?? "";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Centered modal — wide, two-column body */}
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-3 sm:p-6">
          <div className="w-full max-w-5xl bg-zinc-950 rounded-2xl shadow-2xl
                          border border-zinc-800 overflow-hidden animate-slide-up">

            {/* ── Header ─────────────────────────────────────────── */}
            <div className="relative px-7 pt-6 pb-6 bg-gradient-to-b from-zinc-900/80 to-zinc-950
                            border-b border-zinc-800">
              {/* Close */}
              <button
                onClick={onClose}
                aria-label="Close"
                className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center
                           rounded-full bg-zinc-800/60 text-zinc-400 hover:text-zinc-100
                           hover:bg-zinc-700 transition-colors text-sm"
              >
                ✕
              </button>

              {/* Airline + cabin + verification badge */}
              <div className="flex items-center gap-3 mb-5 pr-12">
                {deal.airline_code && (
                  <img
                    src={airlineLogo(deal.airline_code)}
                    alt={deal.airline_code}
                    className="w-10 h-10 rounded-lg object-contain bg-white/95 border border-zinc-700 p-1 flex-shrink-0"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-500 leading-tight">
                    {CABIN_LABEL[deal.cabin_class] ?? deal.cabin_class}
                  </p>
                  <p className="text-base font-semibold text-zinc-100 truncate leading-tight">
                    {AIRLINE_NAME[deal.airline_code] ?? deal.airline_code}
                  </p>
                </div>
                {verifBadge && (
                  <span
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-2xs font-semibold tracking-wider ${badgeColor}`}
                    title={verifBadge.tip}
                  >
                    {verifBadge.label}
                  </span>
                )}
              </div>

              {/* Route + price row — single cohesive band */}
              <div className="flex items-end justify-between gap-6 flex-wrap">
                {/* Left: route visual */}
                <div className="flex items-center gap-4 min-w-0">
                  <div className="text-center">
                    <p className="text-3xl font-serif text-champagne tracking-tight leading-none">
                      {deal.origin}
                    </p>
                    <p className="text-2xs text-zinc-500 mt-1.5 leading-tight">
                      {originAp?.city ?? ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-center min-w-[100px]">
                    <span className="text-2xs text-zinc-500 mb-1">
                      {loadingOffers
                        ? "…"
                        : bestOffer?.duration_minutes
                        ? fmtMins(bestOffer.duration_minutes)
                        : distKm
                        ? `~${Math.round(distKm / 800)}h`
                        : ""}
                    </span>
                    <div className="flex items-center w-full">
                      <span className="h-px flex-1 bg-zinc-700" />
                      <svg className="w-4 h-4 text-champagne mx-1" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M14 8l-3-3v2H2v2h9v2l3-3z"/>
                      </svg>
                      <span className="h-px flex-1 bg-zinc-700" />
                    </div>
                    <span className={`text-2xs mt-1 ${stops === 0 ? "text-emerald-400" : "text-zinc-500"}`}>
                      {loadingOffers ? "" : stopsLabel}
                    </span>
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-serif text-champagne tracking-tight leading-none">
                      {deal.destination}
                    </p>
                    <p className="text-2xs text-zinc-500 mt-1.5 leading-tight">
                      {destAp?.city ?? ""}
                    </p>
                  </div>
                </div>

                {/* Right: price + meta */}
                <div className="flex items-end gap-6">
                  <div>
                    <p className="text-4xl font-bold text-zinc-100 tabular-nums leading-none">
                      ${deal.best_price_usd?.toLocaleString()}
                    </p>
                    <p className="text-xs text-zinc-500 mt-2 flex items-center gap-2 flex-wrap">
                      {deal.departure_date && (
                        <span>{format(new Date(deal.departure_date + "T12:00:00"), "EEE d MMM yyyy")}</span>
                      )}
                      {distKm && (
                        <>
                          <span className="text-zinc-700">·</span>
                          <span>{distKm.toLocaleString()} km</span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Body ───────────────────────────────────────────── */}
            <div className="grid lg:grid-cols-[1.4fr_1fr] divide-x-0 lg:divide-x divide-zinc-800
                            max-h-[70vh] overflow-y-auto">

              {/* ── LEFT: data + visualizations ────────────────── */}
              <div className="p-7 space-y-7">

                {/* Cross-platform compare — replaces the misleading "GEM" framing */}
                <Section
                  label="Verify the price"
                  hint="Open the same flight on each platform. We pulled this fare from Google Flights — these links let you see what the same date returns elsewhere."
                >
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {compareLinks.map((link) => (
                      <a
                        key={link.name}
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg
                                   bg-zinc-900/60 border border-zinc-800 hover:border-champagne/40
                                   hover:bg-zinc-900 transition-colors group"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: link.color }}
                          />
                          <span className="text-xs font-medium text-zinc-200 truncate">{link.short}</span>
                        </span>
                        <span className="text-2xs text-zinc-500 group-hover:text-champagne transition-colors">↗</span>
                      </a>
                    ))}
                  </div>
                </Section>

                {/* Price position */}
                {deal.typical_price_low && deal.typical_price_high && (
                  <Section
                    label="Where this fare sits"
                    hint={
                      savings != null && savings > 0
                        ? `$${savings.toLocaleString()} below Google's typical (${savingsPct}% off).`
                        : "Position against Google's typical price range for this route."
                    }
                  >
                    <PricePositionBar
                      price={deal.best_price_usd}
                      low={deal.typical_price_low}
                      high={deal.typical_price_high}
                      allTimeLow={allTimeLow}
                    />
                  </Section>
                )}

                {/* Recent history sparkline */}
                {history && history.length >= 2 && (
                  <Section
                    label="Last 30 days"
                    hint={
                      allTimeLow
                        ? `All-time low for this route: $${Math.round(allTimeLow).toLocaleString()}.`
                        : "Recent price trend for this exact route + cabin."
                    }
                  >
                    <PriceSparkline
                      data={history}
                      currentPrice={deal.best_price_usd}
                      allTimeLow={allTimeLow}
                    />
                  </Section>
                )}

                {/* Score donut + radar */}
                <Section
                  label="Why we scored it"
                  hint={coldStart ? "Most signals strengthen after 30+ days of price history." : null}
                >
                  <div className="flex items-center gap-6">
                    <ScoreDonut score={deal.score_total} max={170} />
                    <div className="flex-1 min-w-0">
                      <ScoreRadar deal={deal} />
                    </div>
                  </div>
                </Section>

                {/* All flight options */}
                <Section
                  label="All airlines on this date"
                  hint="Cheapest fare per airline for the selected departure. Click a logo to compare."
                >
                  {loadingOffers ? (
                    <div className="h-16 rounded-lg bg-zinc-900/60 animate-pulse" />
                  ) : offers?.length > 0 ? (
                    <div className="rounded-lg border border-zinc-800 overflow-hidden divide-y divide-zinc-800">
                      {offers.slice(0, 8).map((offer, i) => (
                        <OfferRow key={offer.id ?? i} offer={offer} deal={deal} index={i} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500 italic">
                      No offer breakdown yet — run Scan Now to populate per-airline prices.
                    </p>
                  )}
                </Section>
              </div>

              {/* ── RIGHT: cabin / award / AI / nearby ───────────── */}
              <div className="p-7 space-y-7 bg-zinc-950/50">

                {/* Cabin product */}
                {cabinInfo && (
                  <Section label="Cabin">
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-zinc-100 leading-tight">{cabinInfo.product_name}</p>
                          <p className="text-2xs text-zinc-500 mt-0.5">
                            {cabinInfo.configuration} · {cabinInfo.seat_type?.replace("-", " ")}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="font-serif text-2xl text-champagne tabular-nums">
                            {cabinInfo.quality_score}
                          </span>
                          <span className="text-xs text-zinc-600">/100</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {cabinInfo.lie_flat       && <Pill>Lie-flat</Pill>}
                        {cabinInfo.has_door       && <Pill>Private door</Pill>}
                        {cabinInfo.bed_length_cm  && <Pill>{cabinInfo.bed_length_cm}cm bed</Pill>}
                        {cabinInfo.seat_width_cm  && <Pill>{cabinInfo.seat_width_cm}cm wide</Pill>}
                      </div>
                    </div>
                  </Section>
                )}

                {/* Lounge access */}
                {lounge && (deal.cabin_class === "BUSINESS" || deal.cabin_class === "FIRST") && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-champagne/5 border border-champagne/20">
                    <svg className="w-4 h-4 text-champagne flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M2 5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5zm1 7a1 1 0 0 1 1-1h8a1 1 0 0 1 0 2H4a1 1 0 0 1-1-1z"/>
                    </svg>
                    <span className="text-xs text-zinc-300">
                      <span className="font-medium text-champagne">{lounge.name}</span> lounge access
                    </span>
                  </div>
                )}

                {/* Award options — only when we actually have data */}
                {!loadingEnrich && enrichment?.awards?.length > 0 && (
                  <Section label="Award options" hint="Live miles availability via Seats.aero.">
                    <div className="rounded-lg border border-zinc-800 overflow-hidden divide-y divide-zinc-800">
                      {enrichment.awards.slice(0, 4).map((award, i) => {
                        const aXfers = transferPartners[award.loyalty_program] ?? [];
                        return (
                          <div
                            key={`${award.loyalty_program}-${i}`}
                            className={`px-4 py-3 ${i === 0 ? "bg-champagne/5" : "bg-zinc-900/40"}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-zinc-100">
                                  {award.loyalty_program}
                                  {i === 0 && (
                                    <span className="ml-2 text-2xs text-champagne font-bold">BEST VALUE</span>
                                  )}
                                </p>
                                <p className="text-2xs text-zinc-500 mt-0.5">
                                  {award.seats_available} seat{award.seats_available !== 1 ? "s" : ""}
                                  {award.cash_taxes_usd > 0 && ` · $${Math.round(award.cash_taxes_usd).toLocaleString()} taxes`}
                                </p>
                                {aXfers.length > 0 && (
                                  <p className="text-2xs text-zinc-500 mt-1">
                                    Transfer from <span className="text-zinc-300">{aXfers.join(", ")}</span>
                                  </p>
                                )}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-sm font-bold text-zinc-100 tabular-nums">
                                  {award.miles_cost.toLocaleString()}
                                  <span className="text-2xs text-zinc-600 ml-0.5">pts</span>
                                </p>
                                {award.cpp_value != null && (
                                  <p className="text-2xs text-champagne tabular-nums font-semibold mt-0.5">
                                    {award.cpp_value.toFixed(2)}¢/pt
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Section>
                )}

                {/* Nearby airports map (only when there are alternates) */}
                {(routeOrigins.length > 1 || Object.keys(dealsByOrigin).length > 1) && (
                  <Section label="Nearby airports" hint="Compare departure options that might save more.">
                    <div className="rounded-lg overflow-hidden border border-zinc-800">
                      <AirportComparisonMap
                        originCodes={routeOrigins.length > 0 ? routeOrigins : [deal.origin]}
                        destCodes={[deal.destination]}
                        dealsByOrigin={
                          Object.keys(dealsByOrigin).length > 0
                            ? dealsByOrigin
                            : { [deal.origin]: { price_usd: deal.best_price_usd, departure_date: deal.departure_date } }
                        }
                      />
                    </div>
                  </Section>
                )}

                {/* AI analysis */}
                {rec && (
                  <Section label="AI analysis">
                    <div className="rounded-lg bg-zinc-900/40 border border-zinc-800 p-4">
                      <FormattedText text={rec} />
                    </div>
                  </Section>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ===================================================================== */
/*  Building blocks                                                      */
/* ===================================================================== */

function Section({ label, hint, children }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <p className="text-2xs font-semibold text-zinc-500 uppercase tracking-[0.15em]">{label}</p>
      </div>
      {hint && <p className="text-xs text-zinc-500 mb-3 font-light leading-relaxed">{hint}</p>}
      {children}
    </div>
  );
}

function Pill({ children }) {
  return (
    <span className="text-2xs px-2 py-0.5 rounded-full bg-zinc-800/80 text-zinc-300 border border-zinc-700">
      {children}
    </span>
  );
}

function OfferRow({ offer, deal, index }) {
  const code = offer.primary_airline;
  const name = AIRLINE_NAME[code] ?? code ?? "Unknown";
  const orig = offer.origin ?? deal.origin;
  const dest = offer.destination ?? deal.destination;
  const date = offer.departure_date ?? deal.departure_date;
  const cabinSky = { BUSINESS: "business", FIRST: "first", PREMIUM_ECONOMY: "premiumeconomy" }[deal.cabin_class] ?? "business";
  const skyUrl = orig && dest && date
    ? `https://www.skyscanner.com/transport/flights/${orig.toLowerCase()}/${dest.toLowerCase()}/${date.replace(/-/g, "")}/?cabin_class=${cabinSky}&adultsv2=1`
    : null;
  const isCheapest = index === 0;

  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${isCheapest ? "bg-champagne/5" : "bg-zinc-900/40"}`}>
      {code && (
        <img
          src={airlineLogo(code)}
          alt={code}
          className="w-7 h-7 rounded object-contain bg-white/95 p-0.5 flex-shrink-0"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-zinc-100 truncate flex items-center gap-2">
          {name}
          {isCheapest && (
            <span className="text-2xs text-champagne font-bold">CHEAPEST</span>
          )}
        </p>
        <p className="text-2xs text-zinc-500 mt-0.5 flex items-center gap-2 flex-wrap">
          <span className={offer.stops === 0 ? "text-emerald-400 font-medium" : ""}>
            {offer.stops === 0 ? "Direct" : `${offer.stops} stop${offer.stops > 1 ? "s" : ""}`}
          </span>
          {offer.duration_minutes && <span>{fmtMins(offer.duration_minutes)}</span>}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-sm font-bold tabular-nums ${isCheapest ? "text-champagne" : "text-zinc-100"}`}>
          ${offer.price_usd?.toLocaleString()}
        </p>
        {skyUrl && (
          <a
            href={skyUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-2xs text-zinc-500 hover:text-champagne mt-0.5 inline-block"
          >
            Compare ↗
          </a>
        )}
      </div>
    </div>
  );
}
