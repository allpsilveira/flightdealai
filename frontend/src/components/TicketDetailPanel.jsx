import { useEffect, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import api from "../lib/api";
import cabinQuality from "../data/cabin_quality.json";
import transferPartners from "../data/transfer_partners.json";
import loungeAccess from "../data/lounge_access.json";
import AirportComparisonMap from "./AirportComparisonMap";

const CABIN_LABEL = {
  BUSINESS: "Business", FIRST: "First Class", PREMIUM_ECONOMY: "Premium Economy",
};
const AIRLINE_NAME = {
  // North / Central America
  AA: "American Airlines", UA: "United Airlines", DL: "Delta Air Lines",
  WN: "Southwest",         B6: "JetBlue",         AS: "Alaska Airlines",
  CM: "Copa Airlines",     AM: "Aeroméxico",       MX: "Mexicana",
  // South America
  LA: "LATAM Airlines",    G3: "GOL",              AD: "Azul",
  JJ: "LATAM Brasil",      AV: "Avianca",          AR: "Aerolíneas Argentinas",
  H2: "Sky Airline",
  // Europe
  BA: "British Airways",   AF: "Air France",       LH: "Lufthansa",
  KL: "KLM",               IB: "Iberia",           TP: "TAP Air Portugal",
  LX: "Swiss",             OS: "Austrian",          AZ: "ITA Airways",
  VS: "Virgin Atlantic",   TK: "Turkish Airlines",  SK: "SAS",
  AY: "Finnair",
  // Middle East / Africa
  EK: "Emirates",          QR: "Qatar Airways",    EY: "Etihad",
  ET: "Ethiopian Airlines",MS: "EgyptAir",
  // Asia / Pacific
  SQ: "Singapore Airlines",CX: "Cathay Pacific",   NH: "ANA",
  JL: "JAL",               TG: "Thai Airways",     MH: "Malaysia Airlines",
  OZ: "Asiana",            KE: "Korean Air",        CI: "China Airlines",
  BR: "EVA Air",           AI: "Air India",
  // Canada
  AC: "Air Canada",        QF: "Qantas",            NZ: "Air New Zealand",
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

const StopLabel = ({ stops }) =>
  stops === 0
    ? <span className="text-emerald-600 dark:text-emerald-400 font-medium">Direct</span>
    : <span>{stops} stop{stops > 1 ? "s" : ""}</span>;

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

export default function TicketDetailPanel({ deal, onClose, routeOrigins = [] }) {
  const [offers,       setOffers]       = useState(null);
  const [enrichment,   setEnrichment]   = useState(null);
  const [loadingOffers, setLoadingOffers] = useState(true);
  const [loadingEnrich, setLoadingEnrich] = useState(true);

  // Close on Escape
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

  const cabin      = CABIN_BY_AIRLINE[deal.airline_code] ?? null;
  const lounge     = loungeAccess[deal.airline_code] ?? null;
  const xfers      = transferPartners[deal.best_award_program] ?? [];
  const rec        = deal.ai_recommendation_en;
  const coldStart  = deal.percentile_position == null && deal.zscore == null;
  const displayScore = Math.round((deal.score_total / 170) * 100);

  const typicalMid = deal.typical_price_low && deal.typical_price_high
    ? (deal.typical_price_low + deal.typical_price_high) / 2 : null;
  const savings    = typicalMid ? Math.round(typicalMid - deal.best_price_usd) : null;
  const savingsPct = typicalMid && savings > 0 ? Math.round((savings / typicalMid) * 100) : null;

  // Google Flights booking link — formats date as "May 31 2026" which Google parses better
  const cabinSearchLabel = {
    BUSINESS: "business class", FIRST: "first class", PREMIUM_ECONOMY: "premium economy",
  };
  const googleFlightsUrl = (() => {
    if (!deal.origin || !deal.destination || !deal.departure_date) return null;
    const d = new Date(deal.departure_date + "T12:00:00");
    const dateStr = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const cabin = cabinSearchLabel[deal.cabin_class] ?? "business class";
    return `https://www.google.com/travel/flights?q=${encodeURIComponent(
      `${cabin} flights ${deal.origin} to ${deal.destination} ${dateStr}`
    )}`;
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

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 dark:bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Slide-in panel from right */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md
                      bg-white dark:bg-zinc-900 shadow-2xl overflow-y-auto
                      animate-slide-right">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800
                        px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {deal.airline_code && (
              <img
                src={airlineLogo(deal.airline_code)}
                alt={deal.airline_code}
                className="w-9 h-9 rounded-lg object-contain bg-zinc-50 dark:bg-zinc-800
                           border border-zinc-100 dark:border-zinc-700 p-1 flex-shrink-0"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            )}
            <div>
              <p className="text-base font-bold text-zinc-900 dark:text-white">
                {deal.origin} → {deal.destination}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {AIRLINE_NAME[deal.airline_code] ?? deal.airline_code}
                {" · "}{CABIN_LABEL[deal.cabin_class] ?? deal.cabin_class}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full
                       bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400
                       hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5">

          {/* Price + date */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-3xl font-bold text-zinc-900 dark:text-white tabular-nums">
                ${deal.best_price_usd?.toLocaleString()}
              </p>
              <p className="text-xs text-zinc-400 mt-0.5">
                {deal.departure_date
                  ? format(new Date(deal.departure_date), "EEE d MMM yyyy")
                  : ""}
                {deal.is_direct ? " · Direct" : " · Connecting"}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              {deal.is_gem && (
                <div className="px-3 py-1.5 rounded-lg bg-brand-500 text-white text-xs font-bold">
                  ✦ GEM
                </div>
              )}
              {googleFlightsUrl && (
                <a
                  href={googleFlightsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                             bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M2 8l5-5 1.5 1.5L5 8l3.5 3.5L7 13 2 8zm7 0l5-5 1.5 1.5L12 8l3.5 3.5L14 13 9 8z"
                          fillOpacity=".4"/>
                    <path d="M4 8l4-4 4 4-4 4-4-4z" fillOpacity=".0"/>
                    <path fillRule="evenodd" d="M2.5 2.5a1 1 0 011-1h9a1 1 0 011 1v9a1 1 0 01-1 1h-3.5v-1.5H12v-8h-8v3.5H2.5v-4z"/>
                  </svg>
                  Search Google Flights ↗
                </a>
              )}
            </div>
          </div>

          {/* Savings vs Google */}
          {savings != null && savings > 0 ? (
            <div className="px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10
                            border border-emerald-200 dark:border-emerald-500/20">
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                ${savings.toLocaleString()} below Google's typical ({savingsPct}% off)
              </p>
              <p className="text-xs text-emerald-600/70 dark:text-emerald-400/60 mt-0.5">
                Typical: ${deal.typical_price_low?.toLocaleString()} – ${deal.typical_price_high?.toLocaleString()}
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
                    Aggregated from all airlines. Updated every scan.
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-zinc-900 dark:text-white tabular-nums">
                    ${deal.best_price_usd?.toLocaleString()}
                  </p>
                  {deal.google_price_level && (
                    <span className={`text-2xs font-bold uppercase px-1.5 py-0.5 rounded ${
                      deal.google_price_level === "low"
                        ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                        : deal.google_price_level === "high"
                        ? "bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400"
                        : "bg-zinc-100 dark:bg-zinc-700 text-zinc-500"
                    }`}>
                      {deal.google_price_level}
                    </span>
                  )}
                </div>
              </div>

              {/* Duffel */}
              <div className="flex items-start justify-between px-4 py-3 bg-zinc-50 dark:bg-zinc-800/60">
                <div className="flex-1 mr-4">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">Direct via Airline</p>
                  {loadingEnrich ? (
                    <p className="text-xs text-zinc-400 mt-0.5">Loading…</p>
                  ) : enrichment?.duffel ? (
                    <div className="mt-0.5 space-y-0.5">
                      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                        {enrichment.duffel.fare_brand_name ?? "Standard fare"}
                      </p>
                      <p className="text-xs text-zinc-400 leading-snug">
                        {[
                          enrichment.duffel.is_refundable === true && "Refundable",
                          enrichment.duffel.is_refundable === false && "Non-refundable",
                          enrichment.duffel.baggage_included && "Bag included",
                          enrichment.duffel.change_fee_usd != null && `Change fee: $${enrichment.duffel.change_fee_usd}`,
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
                      Fare booked directly with the carrier — includes brand, refund conditions, and baggage. Run "Scan Now" to load.
                    </p>
                  )}
                </div>
                <div className="text-right">
                  {enrichment?.duffel ? (
                    <>
                      <p className="text-sm font-bold text-zinc-900 dark:text-white tabular-nums">
                        ${enrichment.duffel.price_usd?.toLocaleString()}
                      </p>
                      {enrichment.duffel.price_usd > deal.best_price_usd && (
                        <p className="text-2xs text-red-500">
                          +${Math.round(enrichment.duffel.price_usd - deal.best_price_usd).toLocaleString()} vs Google
                        </p>
                      )}
                    </>
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
                    <p className="text-xs text-zinc-400 mt-0.5">Loading…</p>
                  ) : enrichment?.awards?.length > 0 ? (
                    <div className="mt-0.5 space-y-0.5">
                      <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                        via {enrichment.awards[0].loyalty_program}
                      </p>
                      {enrichment.awards[0].cash_taxes_usd > 0 && (
                        <p className="text-xs text-zinc-400">
                          + ${enrichment.awards[0].cash_taxes_usd.toLocaleString()} in taxes
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
                      Award space from Seats.aero — 24 loyalty programs checked. Run "Scan Now" to check availability.
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  {enrichment?.awards?.length > 0 ? (
                    <>
                      <p className="text-sm font-bold text-zinc-900 dark:text-white tabular-nums">
                        {enrichment.awards[0].miles_cost.toLocaleString()}
                        <span className="text-xs font-normal text-zinc-400 ml-0.5">pts</span>
                      </p>
                      {enrichment.awards[0].cpp_value != null && (
                        <p className="text-xs font-bold text-brand-500 tabular-nums">
                          {enrichment.awards[0].cpp_value.toFixed(2)}¢/pt
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-zinc-400">—</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Award Programs — full breakdown if any available */}
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

          {/* Airport comparison — always show map (nearby airports even if route has 1 origin) */}
          <div>
            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
              Nearby Airports
            </p>
            <AirportComparisonMap
              originCodes={routeOrigins.length > 0 ? routeOrigins : [deal.origin]}
              destCodes={[deal.destination]}
              dealsByOrigin={{ [deal.origin]: { price_usd: deal.best_price_usd, departure_date: deal.departure_date } }}
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
                      {origin === deal.origin && (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                          Cheapest ✓
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      {origin === deal.origin ? (
                        <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          ${deal.best_price_usd?.toLocaleString()}
                        </p>
                      ) : (
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">Scan to compare prices</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Flight Options */}
          <div>
            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
              All Flight Options on This Route
            </p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-3 leading-snug">
              Cheapest fare found per airline for this departure date. Prices from Google Flights via SerpApi.
            </p>
            {loadingOffers ? (
              <div className="h-16 rounded-xl bg-zinc-50 dark:bg-zinc-800 animate-pulse" />
            ) : offers?.length > 0 ? (
              <div className="rounded-xl border border-zinc-100 dark:border-zinc-700/60 overflow-hidden
                              divide-y divide-zinc-100 dark:divide-zinc-700/60">
                {offers.map((offer, i) => {
                  const airlineName = AIRLINE_NAME[offer.primary_airline] ?? offer.primary_airline ?? "Unknown";
                  const depDate = offer.departure_date
                    ? new Date(offer.departure_date + "T12:00:00")
                    : null;
                  const gfUrl = offer.origin && offer.destination
                    ? `https://www.google.com/travel/flights?q=${encodeURIComponent(
                        `${airlineName} flights ${offer.origin} to ${offer.destination}${depDate ? " " + depDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : ""}`
                      )}`
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
                        <p className="text-sm font-semibold text-zinc-900 dark:text-white flex items-center gap-2 flex-wrap">
                          {airlineName}
                          {i === 0 && (
                            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">Cheapest</span>
                          )}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-2 flex-wrap">
                          <StopLabel stops={offer.stops} />
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
                        {gfUrl && (
                          <a
                            href={gfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 font-medium"
                          >
                            Search ↗
                          </a>
                        )}
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
                  </p>
                </div>
                <span className="text-2xl font-bold text-brand-500 tabular-nums">
                  {cabin.quality_score}
                  <span className="text-sm font-normal text-zinc-400">/100</span>
                </span>
              </div>
            </div>
          )}

          {/* Lounge */}
          {lounge && (deal.cabin_class === "BUSINESS" || deal.cabin_class === "FIRST") && (
            <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
              <svg className="w-4 h-4 text-brand-500 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5zm1 7a1 1 0 0 1 1-1h8a1 1 0 0 1 0 2H4a1 1 0 0 1-1-1z"/>
              </svg>
              <span><span className="font-medium">{lounge.name}</span> lounge access included</span>
            </div>
          )}

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
    </>
  );
}
