import { useEffect } from "react";
import { format } from "date-fns";
import cabinQuality from "../data/cabin_quality.json";
import transferPartners from "../data/transfer_partners.json";
import loungeAccess from "../data/lounge_access.json";

const CABIN_LABEL = {
  BUSINESS: "Business", FIRST: "First Class", PREMIUM_ECONOMY: "Premium Economy",
};
const AIRLINE_NAME = {
  AA: "American Airlines", UA: "United Airlines", DL: "Delta Air Lines",
  LA: "LATAM Airlines", QR: "Qatar Airways", EK: "Emirates",
  LH: "Lufthansa", BA: "British Airways", AF: "Air France",
  SQ: "Singapore Airlines", CX: "Cathay Pacific", NH: "ANA",
  JL: "JAL", TK: "Turkish Airlines", AZ: "ITA Airways",
  G3: "GOL", AD: "Azul", JJ: "TAM",
};
const CABIN_BY_AIRLINE = cabinQuality.reduce((acc, e) => {
  if (!acc[e.airline_code]) acc[e.airline_code] = e;
  return acc;
}, {});

const airlineLogo = (code) =>
  code ? `https://images.kiwi.com/airlines/64/${code}.png` : null;

const googleFlightsUrl = (origin, dest, depDate, cabin) => {
  const cabinMap = { BUSINESS: "business", FIRST: "first", PREMIUM_ECONOMY: "premium_economy" };
  return `https://www.google.com/travel/flights?hl=en&curr=USD#flt=${origin}.${dest}.${depDate};c:USD;e:1;t:${cabinMap[cabin] ?? "business"}`;
};

const ScoreRow = ({ label, value, max }) => {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-zinc-400 dark:text-zinc-500 w-32 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-brand-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 tabular-nums w-8 text-right">
        {Math.round(value)}
      </span>
    </div>
  );
};

export default function DealDetail({ deal, onClose }) {
  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const cabin  = CABIN_BY_AIRLINE[deal.airline_code] ?? null;
  const lounge = loungeAccess[deal.airline_code] ?? null;
  const xfers  = transferPartners[deal.best_award_program] ?? [];
  const rec    = deal.ai_recommendation_en;

  const typicalMid = deal.typical_price_low && deal.typical_price_high
    ? (deal.typical_price_low + deal.typical_price_high) / 2 : null;
  const savings    = typicalMid ? Math.round(typicalMid - deal.best_price_usd) : null;
  const savingsPct = typicalMid && savings > 0 ? Math.round((savings / typicalMid) * 100) : null;
  const coldStart  = deal.percentile_position == null && deal.zscore == null;

  const scoreRows = [
    { label: "Percentile (30)",       value: deal.score_percentile,      max: 30 },
    { label: "Z-score (20)",          value: deal.score_zscore,          max: 20 },
    { label: "Trend align (15)",      value: deal.score_trend_alignment,  max: 15 },
    { label: "Trend direction (10)",  value: deal.score_trend_direction,  max: 10 },
    { label: "Cross-source (20)",     value: deal.score_cross_source,     max: 20 },
    { label: "Arbitrage (10)",        value: deal.score_arbitrage,        max: 10 },
    { label: "Fare brand (10)",       value: deal.score_fare_brand,       max: 10 },
    { label: "Scarcity (5)",          value: deal.score_scarcity,         max: 5  },
    { label: "Award bonus (50)",      value: deal.score_award,            max: 50 },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4
                 bg-black/50 dark:bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto
                   bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center
                     rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400
                     hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors z-10"
        >
          ✕
        </button>

        {/* GEM banner */}
        {deal.is_gem && (
          <div className="bg-brand-500 px-6 py-3 rounded-t-2xl">
            <p className="text-sm font-bold text-white">
              ✦ GEM DEAL — Not listed on Google Flights
            </p>
          </div>
        )}

        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-start gap-4">
            {deal.airline_code && (
              <img
                src={airlineLogo(deal.airline_code)}
                alt={deal.airline_code}
                className="w-12 h-12 rounded-xl object-contain bg-zinc-50 dark:bg-zinc-800
                           border border-zinc-100 dark:border-zinc-700 p-1.5 flex-shrink-0"
                onError={e => { e.currentTarget.style.display = "none"; }}
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xl font-bold text-zinc-900 dark:text-white">
                <span>{deal.origin}</span>
                <svg className="w-4 h-4 text-zinc-400" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M2 7h10M8 3l4 4-4 4"/>
                </svg>
                <span>{deal.destination}</span>
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                {AIRLINE_NAME[deal.airline_code] ?? deal.airline_code}
                {" · "}{CABIN_LABEL[deal.cabin_class] ?? deal.cabin_class}
                {deal.is_direct ? " · Direct" : " · Connecting"}
                {deal.departure_date && (
                  <>{" · "}{format(new Date(deal.departure_date), "EEEE, d MMM yyyy")}</>
                )}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-3xl font-bold text-zinc-900 dark:text-white tabular-nums">
                ${deal.best_price_usd?.toLocaleString()}
              </p>
              <p className="text-xs text-zinc-400 mt-0.5">per person</p>
            </div>
          </div>

          {/* Savings vs Google */}
          {(savings != null && savings > 0) ? (
            <div className="px-4 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10
                            border border-emerald-200 dark:border-emerald-500/20">
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                ${savings.toLocaleString()} below Google's typical price ({savingsPct}% off)
              </p>
              <p className="text-xs text-emerald-600/70 dark:text-emerald-400/60 mt-0.5">
                Google typical range: ${deal.typical_price_low?.toLocaleString()} – ${deal.typical_price_high?.toLocaleString()}
                {deal.google_price_level && (
                  <span className="ml-2 font-semibold uppercase">[Google: {deal.google_price_level}]</span>
                )}
              </p>
            </div>
          ) : coldStart ? (
            <div className="px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Building price baseline — comparisons will appear after a few scans on this route
              </p>
            </div>
          ) : null}

          {/* Percentile + z-score */}
          {!coldStart && (
            <div className="flex items-center gap-4 text-sm">
              {deal.percentile_position != null && (
                <span>
                  Bottom <span className="font-semibold text-zinc-900 dark:text-white">
                    {Math.round(deal.percentile_position)}%
                  </span> of 90-day prices
                </span>
              )}
              {deal.zscore != null && deal.zscore > 0 && (
                <span className="text-zinc-400">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    {deal.zscore.toFixed(1)}σ
                  </span> below average
                </span>
              )}
            </div>
          )}

          {/* Cabin quality */}
          {cabin && (
            <div>
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
                Cabin
              </p>
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

          {/* Award */}
          {deal.best_award_miles && (
            <div>
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
                Award Alternative
              </p>
              <div className="px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 space-y-1.5">
                <p className="text-sm">
                  <span className="font-semibold text-zinc-900 dark:text-white">
                    {deal.best_award_miles.toLocaleString()} miles
                  </span>
                  {" "}via {deal.best_award_program}
                  {deal.best_cpp && (
                    <span className="text-brand-500 ml-2 font-medium">{deal.best_cpp.toFixed(1)}¢/pt</span>
                  )}
                </p>
                {xfers.length > 0 && (
                  <p className="text-xs text-zinc-400 dark:text-zinc-500">
                    Transfer from: {xfers.join(" · ")}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Score breakdown */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                Score Breakdown
              </p>
              <span className="text-lg font-bold text-zinc-900 dark:text-white tabular-nums">
                {Math.round(deal.score_total)}<span className="text-sm font-normal text-zinc-400">/170</span>
              </span>
            </div>
            {coldStart && (
              <p className="text-xs text-zinc-400 italic mb-2">
                Most scoring dimensions require 30+ days of price history. Scores will rise automatically.
              </p>
            )}
            <div className="space-y-2">
              {scoreRows.map(({ label, value, max }) => (
                <ScoreRow key={label} label={label} value={value} max={max} />
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

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <a
              href={googleFlightsUrl(deal.origin, deal.destination, deal.departure_date, deal.cabin_class)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary flex-1 text-center"
            >
              Search on Google Flights ↗
            </a>
            <button onClick={onClose} className="btn-ghost px-6">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
