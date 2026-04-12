import { useEffect, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import api from "../lib/api";
import cabinQuality from "../data/cabin_quality.json";
import transferPartners from "../data/transfer_partners.json";
import loungeAccess from "../data/lounge_access.json";
import allAirports from "../data/airports.json";
import AirportComparisonMap from "./AirportComparisonMap";

const airportMap = Object.fromEntries(allAirports.map((a) => [a.iata, a]));

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

const ScoreRow = ({ label, value, max, description }) => {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 w-36 flex-shrink-0">{label}</span>
        <div className="flex-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 tabular-nums w-8 text-right">
          {Math.round(value)}
        </span>
      </div>
      {description && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500 pl-[calc(9rem+12px)] leading-tight">
          {description}
        </p>
      )}
    </div>
  );
};

export default function TicketDetailPanel({ deal, onClose, routeOrigins = [], dealsByOrigin = {} }) {
  const [offers,        setOffers]        = useState(null);
  const [enrichment,    setEnrichment]    = useState(null);
  const [loadingOffers, setLoadingOffers] = useState(true);
  const [loadingEnrich, setLoadingEnrich] = useState(true);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

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

    return () => { cancelled = true; };
  }, [deal?.id]);

  if (!deal) return null;

  // Airport metadata
  const originAp = airportMap[deal.origin];
  const destAp   = airportMap[deal.destination];
  const distKm   = originAp && destAp
    ? Math.round(haversineKm(originAp.lat, originAp.lon, destAp.lat, destAp.lon))
    : null;

  // Best offer (cheapest per date, sorted by price — index 0 = cheapest)
  const bestOffer = offers?.[0] ?? null;

  const cabin     = CABIN_BY_AIRLINE[deal.airline_code] ?? null;
  const lounge    = loungeAccess[deal.airline_code] ?? null;
  const xfers     = transferPartners[deal.best_award_program] ?? [];
  const rec       = deal.ai_recommendation_en;
  const coldStart = deal.percentile_position == null && deal.zscore == null;
  const displayScore = Math.round((deal.score_total / 170) * 100);

  const typicalMid  = deal.typical_price_low && deal.typical_price_high
    ? (deal.typical_price_low + deal.typical_price_high) / 2 : null;
  const savings     = typicalMid ? Math.round(typicalMid - deal.best_price_usd) : null;
  const savingsPct  = typicalMid && savings > 0 ? Math.round((savings / typicalMid) * 100) : null;

  // Booking links — both Google Flights and Skyscanner with specific date/route/cabin
  const { skyscannerUrl, googleFlightsUrl } = (() => {
    if (!deal.origin || !deal.destination || !deal.departure_date) return {};
    const dateStr = deal.departure_date.replace(/-/g, ""); // YYYYMMDD for Skyscanner
    const cabinMap = { BUSINESS: "business", FIRST: "first", PREMIUM_ECONOMY: "premiumeconomy" };
    const cabin = cabinMap[deal.cabin_class] ?? "business";
    const d = new Date(deal.departure_date + "T12:00:00");
    const dateLabel = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const cabinLabel = { BUSINESS: "business class", FIRST: "first class", PREMIUM_ECONOMY: "premium economy" }[deal.cabin_class] ?? "business class";
    return {
      skyscannerUrl:   `https://www.skyscanner.com/transport/flights/${deal.origin.toLowerCase()}/${deal.destination.toLowerCase()}/${dateStr}/?cabin_class=${cabin}&adultsv2=1`,
      googleFlightsUrl: `https://www.google.com/travel/flights?q=${encodeURIComponent(`${cabinLabel} flights ${deal.origin} to ${deal.destination} ${dateLabel}`)}`,
    };
  })();

  const scoreRows = [
    { label: "Percentile (18)",     value: Math.round((deal.score_percentile / 30) * 18),     max: 18, description: "How rare this price is in 90 days of history. Bottom 5% = full points." },
    { label: "Z-score (12)",        value: Math.round((deal.score_zscore / 20) * 12),          max: 12, description: "How many standard deviations below the average. ≥2.5σ may indicate an error fare." },
    { label: "Trend align (9)",     value: Math.round((deal.score_trend_alignment / 15) * 9),  max: 9,  description: "Whether this price is below Google's typical price range for this route." },
    { label: "Trend direction (6)", value: Math.round((deal.score_trend_direction / 10) * 6),  max: 6,  description: "7-day price slope. Rising prices = lower score; falling = higher score." },
    { label: "Cross-source (12)",   value: Math.round((deal.score_cross_source / 20) * 12),    max: 12, description: "How many data sources agree this is a low price (Google, Duffel, Seats.aero)." },
    { label: "Arbitrage (6)",       value: Math.round((deal.score_arbitrage / 10) * 6),        max: 6,  description: "Savings between the cheapest and most expensive departure airport for this route." },
    { label: "Fare brand (6)",      value: Math.round((deal.score_fare_brand / 10) * 6),       max: 6,  description: "Business Lite detected well below standard rate — more seat, lower price." },
    { label: "Scarcity (3)",        value: Math.round((deal.score_scarcity / 5) * 3),          max: 3,  description: "Fewer seats remaining = higher urgency. 1 seat left = maximum points." },
    { label: "Award bonus (28)",    value: Math.round((deal.score_award / 50) * 28),           max: 28, description: "Miles redemption value vs cash. High CPP (cents per point) = strong award deal." },
  ];

  const stops = bestOffer?.stops ?? (deal.is_direct ? 0 : null);
  const stopsLabel = stops === 0 ? "Direct" : stops != null ? `${stops} stop${stops > 1 ? "s" : ""}` : deal.is_direct ? "Direct" : "Connecting";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 dark:bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Centered modal */}
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-3 sm:p-6">
          <div className="w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl
                          overflow-hidden animate-slide-up">

            {/* ── Rich flight header ────────────────────────────────── */}
            <div className="relative px-6 pt-5 pb-5 bg-zinc-50 dark:bg-zinc-800/60
                            border-b border-zinc-200 dark:border-zinc-700">
              {/* Close */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center
                           rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300
                           hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors text-sm"
              >
                ✕
              </button>

              {/* Airline + cabin row */}
              <div className="flex items-center gap-2.5 mb-4 pr-10">
                {deal.airline_code && (
                  <img
                    src={airlineLogo(deal.airline_code)}
                    alt={deal.airline_code}
                    className="w-8 h-8 rounded-lg object-contain bg-white dark:bg-zinc-700
                               border border-zinc-200 dark:border-zinc-600 p-0.5 flex-shrink-0"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 truncate">
                    {AIRLINE_NAME[deal.airline_code] ?? deal.airline_code}
                    {" · "}{CABIN_LABEL[deal.cabin_class] ?? deal.cabin_class}
                  </p>
                </div>
                {deal.is_gem && (
                  <span className="ml-auto flex-shrink-0 px-2.5 py-1 rounded-lg bg-brand-500 text-white text-xs font-bold">
                    ✦ GEM
                  </span>
                )}
              </div>

              {/* Route visual */}
              <div className="flex items-center gap-3 mb-4">
                <div className="text-center min-w-[56px]">
                  <p className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">
                    {deal.origin}
                  </p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 leading-tight">
                    {originAp?.city ?? ""}
                  </p>
                </div>

                <div className="flex-1 flex flex-col items-center gap-1">
                  <div className="flex items-center gap-2 w-full">
                    <div className="h-px flex-1 bg-zinc-300 dark:bg-zinc-600" />
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap px-1">
                      {loadingOffers
                        ? "…"
                        : bestOffer?.duration_minutes
                        ? fmtMins(bestOffer.duration_minutes)
                        : distKm
                        ? `~${Math.round(distKm / 800)}h`
                        : ""}
                    </span>
                    <div className="h-px flex-1 bg-zinc-300 dark:bg-zinc-600" />
                  </div>
                  <p className={`text-xs font-semibold ${
                    stops === 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-zinc-500 dark:text-zinc-400"
                  }`}>
                    {loadingOffers ? "" : stopsLabel}
                  </p>
                </div>

                <div className="text-center min-w-[56px]">
                  <p className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">
                    {deal.destination}
                  </p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 leading-tight">
                    {destAp?.city ?? ""}
                  </p>
                </div>
              </div>

              {/* Price + meta strip */}
              <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-3xl font-bold text-zinc-900 dark:text-white tabular-nums leading-none">
                    ${deal.best_price_usd?.toLocaleString()}
                  </p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1.5 flex items-center gap-2 flex-wrap">
                    {deal.departure_date && (
                      <span>{format(new Date(deal.departure_date + "T12:00:00"), "EEE d MMM yyyy")}</span>
                    )}
                    {distKm && (
                      <span className="flex items-center gap-1">
                        <span className="text-zinc-300 dark:text-zinc-600">·</span>
                        {distKm.toLocaleString()} km
                      </span>
                    )}
                    {cabin?.seat_type && (
                      <span className="flex items-center gap-1">
                        <span className="text-zinc-300 dark:text-zinc-600">·</span>
                        {cabin.seat_type.replace("-", " ")}
                        {cabin.lie_flat ? " · Lie-flat" : ""}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {deal.google_price_level && (
                    <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                      deal.google_price_level === "low"
                        ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                        : deal.google_price_level === "high"
                        ? "bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400"
                        : "bg-zinc-100 dark:bg-zinc-700 text-zinc-500"
                    }`}>
                      Google: {deal.google_price_level}
                    </span>
                  )}
                  <div className="flex items-center gap-2">
                    {googleFlightsUrl && (
                      <a href={googleFlightsUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold
                                   bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                        Google ↗
                      </a>
                    )}
                    {skyscannerUrl && (
                      <a href={skyscannerUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold
                                   bg-[#0770e3] hover:bg-blue-800 text-white transition-colors">
                        Skyscanner ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Panel body ──────────────────────────────────────── */}
            <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">

              {/* Savings vs Google typical */}
              {savings != null && savings > 0 ? (
                <div className="px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10
                                border border-emerald-200 dark:border-emerald-500/20">
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                    ${savings.toLocaleString()} below Google's typical ({savingsPct}% off)
                  </p>
                  <p className="text-xs text-emerald-600/70 dark:text-emerald-400/60 mt-0.5">
                    Google's typical range for this route: ${deal.typical_price_low?.toLocaleString()} – ${deal.typical_price_high?.toLocaleString()}
                  </p>
                </div>
              ) : coldStart ? (
                <div className="px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Building price baseline — comparisons appear after a few scans
                  </p>
                </div>
              ) : null}

              {/* Price Sources */}
              <div>
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
                  Price Sources
                </p>
                <div className="rounded-xl border border-zinc-100 dark:border-zinc-700/60 overflow-hidden
                                divide-y divide-zinc-100 dark:divide-zinc-700/60">

                  {/* Google Flights */}
                  <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 dark:bg-zinc-800/60">
                    <div className="flex-1 mr-4">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white">Google Flights</p>
                      <p className="text-xs text-zinc-400 mt-0.5 leading-snug">
                        Aggregated from all airlines via Google. Includes typical price range for this route.
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-zinc-900 dark:text-white tabular-nums">
                        ${deal.best_price_usd?.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Duffel — Direct via Airline */}
                  <div className="flex items-start justify-between px-4 py-3 bg-zinc-50 dark:bg-zinc-800/60">
                    <div className="flex-1 mr-4">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white">Direct via Airline</p>
                      {loadingEnrich ? (
                        <p className="text-xs text-zinc-400 mt-0.5">Checking…</p>
                      ) : enrichment?.duffel ? (
                        <div className="mt-0.5 space-y-0.5">
                          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                            {enrichment.duffel.fare_brand_name ?? "Standard fare"}
                          </p>
                          <p className="text-xs text-zinc-400 leading-snug">
                            {[
                              enrichment.duffel.is_refundable === true  && "Refundable",
                              enrichment.duffel.is_refundable === false && "Non-refundable",
                              enrichment.duffel.baggage_included        && "Bag included",
                              enrichment.duffel.booking_class           && `Class ${enrichment.duffel.booking_class}`,
                              enrichment.duffel.change_fee_usd != null  && `Change fee: $${enrichment.duffel.change_fee_usd}`,
                            ].filter(Boolean).join(" · ")}
                          </p>
                          {enrichment.duffel.expires_at && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                              Offer expires {formatDistanceToNow(new Date(enrichment.duffel.expires_at), { addSuffix: true })}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-400 mt-0.5 leading-snug">
                          Live price from airline GDS via Duffel. Requires <span className="font-medium text-zinc-600 dark:text-zinc-300">DUFFEL_API_KEY</span> in EasyPanel + Scan Now.
                        </p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      {enrichment?.duffel ? (
                        <div>
                          <p className="text-sm font-bold text-zinc-900 dark:text-white tabular-nums">
                            ${enrichment.duffel.price_usd?.toLocaleString()}
                          </p>
                          {enrichment.duffel.price_usd > deal.best_price_usd ? (
                            <p className="text-xs text-red-500 tabular-nums">
                              +${Math.round(enrichment.duffel.price_usd - deal.best_price_usd).toLocaleString()} vs Google
                            </p>
                          ) : enrichment.duffel.price_usd < deal.best_price_usd ? (
                            <p className="text-xs text-emerald-500 tabular-nums">
                              −${Math.round(deal.best_price_usd - enrichment.duffel.price_usd).toLocaleString()} vs Google
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-400">—</p>
                      )}
                    </div>
                  </div>

                  {/* Award */}
                  <div className="flex items-start justify-between px-4 py-3 bg-zinc-50 dark:bg-zinc-800/60">
                    <div className="flex-1 mr-4">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white">Best Award</p>
                      {loadingEnrich ? (
                        <p className="text-xs text-zinc-400 mt-0.5">Checking…</p>
                      ) : enrichment?.awards?.length > 0 ? (
                        <div className="mt-0.5 space-y-0.5">
                          <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                            via {enrichment.awards[0].loyalty_program}
                          </p>
                          {enrichment.awards[0].cash_taxes_usd > 0 && (
                            <p className="text-xs text-zinc-400">
                              + ${enrichment.awards[0].cash_taxes_usd.toLocaleString()} taxes
                            </p>
                          )}
                          {enrichment.awards[0].seats_available <= 4 && (
                            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                              ⚡ {enrichment.awards[0].seats_available} seat{enrichment.awards[0].seats_available !== 1 ? "s" : ""} left
                            </p>
                          )}
                          {xfers.length > 0 && (
                            <p className="text-xs text-zinc-400">
                              Transfer from: {xfers.join(", ")}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-400 mt-0.5 leading-snug">
                          Award availability via Seats.aero (24 programs). Requires <span className="font-medium text-zinc-600 dark:text-zinc-300">SEATS_AERO_API_KEY</span> + Scan Now.
                        </p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      {enrichment?.awards?.length > 0 ? (
                        <div>
                          <p className="text-sm font-bold text-zinc-900 dark:text-white tabular-nums">
                            {enrichment.awards[0].miles_cost.toLocaleString()}
                            <span className="text-xs font-normal text-zinc-400 ml-0.5">pts</span>
                          </p>
                          {enrichment.awards[0].cpp_value != null && (
                            <p className="text-xs font-bold text-brand-500 tabular-nums">
                              {enrichment.awards[0].cpp_value.toFixed(2)}¢/pt
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-400">—</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Award Programs — full breakdown */}
              {!loadingEnrich && enrichment?.awards?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
                    Award Options
                  </p>
                  <div className="rounded-xl border border-zinc-100 dark:border-zinc-700/60 overflow-hidden
                                  divide-y divide-zinc-100 dark:divide-zinc-700/60">
                    {enrichment.awards.map((award, i) => {
                      const awardXfers = transferPartners[award.loyalty_program] ?? [];
                      return (
                        <div
                          key={`${award.loyalty_program}-${i}`}
                          className={`px-4 py-3 ${
                            i === 0 ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-zinc-50 dark:bg-zinc-800/60"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                                {award.loyalty_program}
                                {i === 0 && (
                                  <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400 font-bold">Best value</span>
                                )}
                              </p>
                              <p className="text-xs text-zinc-400 mt-0.5">
                                {award.seats_available} seat{award.seats_available !== 1 ? "s" : ""}
                                {award.operating_airline && ` · Operated by ${award.operating_airline}`}
                                {award.cash_taxes_usd > 0 && ` · $${award.cash_taxes_usd.toLocaleString()} taxes`}
                              </p>
                              {awardXfers.length > 0 && (
                                <p className="text-xs text-zinc-400 mt-0.5">
                                  Transfer from: <span className="text-zinc-600 dark:text-zinc-300">{awardXfers.join(", ")}</span>
                                </p>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-bold text-zinc-900 dark:text-white tabular-nums">
                                {award.miles_cost.toLocaleString()}
                                <span className="text-xs font-normal text-zinc-400 ml-0.5">pts</span>
                              </p>
                              {award.cpp_value != null && (
                                <p className="text-xs text-brand-500 tabular-nums font-semibold">
                                  {award.cpp_value.toFixed(2)}¢/pt
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Cabin quality */}
              {cabin && (
                <div>
                  <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">Cabin</p>
                  <div className="flex items-center justify-between px-4 py-3 rounded-xl
                                  bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white">{cabin.product_name}</p>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                        {cabin.configuration} · {cabin.seat_type.replace("-", " ")}
                        {cabin.has_door && " · Private door"}
                        {cabin.lie_flat && " · Lie-flat bed"}
                        {cabin.bed_length_cm && ` · ${cabin.bed_length_cm} cm bed`}
                      </p>
                    </div>
                    <span className="text-2xl font-bold text-brand-500 tabular-nums flex-shrink-0">
                      {cabin.quality_score}
                      <span className="text-sm font-normal text-zinc-400">/100</span>
                    </span>
                  </div>
                </div>
              )}

              {/* Lounge */}
              {lounge && (deal.cabin_class === "BUSINESS" || deal.cabin_class === "FIRST") && (
                <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300 px-1">
                  <svg className="w-4 h-4 text-brand-500 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M2 5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5zm1 7a1 1 0 0 1 1-1h8a1 1 0 0 1 0 2H4a1 1 0 0 1-1-1z"/>
                  </svg>
                  <span><span className="font-medium">{lounge.name}</span> lounge access included</span>
                </div>
              )}

              {/* Nearby Airports map */}
              <div>
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
                  Nearby Airports
                </p>
                <AirportComparisonMap
                  originCodes={routeOrigins.length > 0 ? routeOrigins : [deal.origin]}
                  destCodes={[deal.destination]}
                  dealsByOrigin={
                    Object.keys(dealsByOrigin).length > 0
                      ? dealsByOrigin
                      : { [deal.origin]: { price_usd: deal.best_price_usd, departure_date: deal.departure_date } }
                  }
                />
                {routeOrigins.length > 1 && (
                  <div className="mt-2 rounded-xl border border-zinc-100 dark:border-zinc-700/60 overflow-hidden
                                  divide-y divide-zinc-100 dark:divide-zinc-700/60">
                    {routeOrigins.map((origin) => (
                      <div
                        key={origin}
                        className={`flex items-center justify-between px-4 py-3 ${
                          origin === deal.origin
                            ? "bg-emerald-50 dark:bg-emerald-500/10"
                            : "bg-zinc-50 dark:bg-zinc-800/60"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-zinc-900 dark:text-white">{origin}</span>
                          <span className="text-xs text-zinc-400">{airportMap[origin]?.city ?? ""}</span>
                          {origin === deal.origin && (
                            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">Cheapest ✓</span>
                          )}
                        </div>
                        <div className="text-right">
                          {origin === deal.origin ? (
                            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                              ${deal.best_price_usd?.toLocaleString()}
                            </p>
                          ) : (
                            <p className="text-xs text-zinc-400">Scan to compare</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* All flight options */}
              <div>
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-1">
                  All Flight Options on This Route
                </p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-3 leading-snug">
                  Cheapest fare per airline for this departure date. Prices from Google Flights via SerpApi.
                </p>
                {loadingOffers ? (
                  <div className="h-16 rounded-xl bg-zinc-50 dark:bg-zinc-800 animate-pulse" />
                ) : offers?.length > 0 ? (
                  <div className="rounded-xl border border-zinc-100 dark:border-zinc-700/60 overflow-hidden
                                  divide-y divide-zinc-100 dark:divide-zinc-700/60">
                    {offers.map((offer, i) => {
                      const airlineName = AIRLINE_NAME[offer.primary_airline] ?? offer.primary_airline ?? "Unknown";
                      const depDate = offer.departure_date
                        ? new Date(offer.departure_date + "T12:00:00") : null;
                      const orig = offer.origin ?? deal.origin;
                      const dest2 = offer.destination ?? deal.destination;
                      const offerIsoDate = offer.departure_date ?? deal.departure_date;
                      const offerDateStr = offerIsoDate?.replace(/-/g, "");
                      const offerCabin = { BUSINESS: "business", FIRST: "first", PREMIUM_ECONOMY: "premiumeconomy" }[deal.cabin_class] ?? "business";
                      const offerDateLabel = depDate ? depDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
                      const skyScannerOfferUrl = orig && dest2 && offerDateStr
                        ? `https://www.skyscanner.com/transport/flights/${orig.toLowerCase()}/${dest2.toLowerCase()}/${offerDateStr}/?cabin_class=${offerCabin}&adultsv2=1`
                        : null;
                      const gfUrl = orig && dest2
                        ? `https://www.google.com/travel/flights?q=${encodeURIComponent(`${airlineName} ${offerCabin} class flights ${orig} to ${dest2}${offerDateLabel ? " " + offerDateLabel : ""}`)}`
                        : null;
                      return (
                        <div
                          key={offer.id}
                          className={`flex items-center gap-3 px-4 py-3 ${
                            i === 0 ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-zinc-50 dark:bg-zinc-800/60"
                          }`}
                        >
                          {offer.primary_airline && (
                            <img
                              src={airlineLogo(offer.primary_airline)}
                              alt={offer.primary_airline}
                              className="w-7 h-7 rounded object-contain bg-white dark:bg-zinc-700 p-0.5 flex-shrink-0"
                              onError={(e) => { e.currentTarget.style.display = "none"; }}
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                              {airlineName}
                              {i === 0 && (
                                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">Cheapest</span>
                              )}
                            </p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-2 flex-wrap">
                              <span className={offer.stops === 0 ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}>
                                {offer.stops === 0 ? "Direct" : `${offer.stops} stop${offer.stops > 1 ? "s" : ""}`}
                              </span>
                              {offer.duration_minutes && <span>{fmtMins(offer.duration_minutes)}</span>}
                              {offer.airline_codes?.length > 1 && (
                                <span className="text-zinc-400">Codeshare: {offer.airline_codes.join(" + ")}</span>
                              )}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                            <p className={`text-sm font-bold tabular-nums ${
                              i === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-900 dark:text-white"
                            }`}>
                              ${offer.price_usd?.toLocaleString()}
                            </p>
                            <div className="flex items-center gap-2">
                              {gfUrl && (
                                <a href={gfUrl} target="_blank" rel="noopener noreferrer"
                                   className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 font-medium">
                                  Google ↗
                                </a>
                              )}
                              {skyScannerOfferUrl && (
                                <a href={skyScannerOfferUrl} target="_blank" rel="noopener noreferrer"
                                   className="text-xs text-[#0770e3] hover:text-blue-700 dark:text-blue-400 font-medium">
                                  Sky ↗
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">
                    No offer breakdown yet — run Scan Now to populate per-airline prices.
                  </p>
                )}
              </div>

              {/* Score breakdown */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                    Score Breakdown
                  </p>
                  <span className="text-lg font-bold text-zinc-900 dark:text-white tabular-nums">
                    {displayScore}
                    <span className="text-sm font-normal text-zinc-400">/100</span>
                  </span>
                </div>
                {coldStart && (
                  <p className="text-xs text-zinc-400 italic mb-2">
                    Most scores require 30+ days of price history.
                  </p>
                )}
                <div className="space-y-3">
                  {scoreRows.map(({ label, value, max, description }) => (
                    <ScoreRow key={label} label={label} value={value} max={max} description={description} />
                  ))}
                </div>
              </div>

              {/* AI recommendation */}
              {rec && (
                <div>
                  <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
                    AI Analysis
                  </p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">{rec}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
