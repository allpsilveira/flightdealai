import { useState } from "react";
import { format } from "date-fns";
import cabinQuality from "../data/cabin_quality.json";
import transferPartners from "../data/transfer_partners.json";
import loungeAccess from "../data/lounge_access.json";

const CABIN_LABEL = {
  BUSINESS:        "Business",
  FIRST:           "First Class",
  PREMIUM_ECONOMY: "Premium Economy",
};

const AIRLINE_NAME = {
  AA: "American", UA: "United", DL: "Delta", LA: "LATAM",
  QR: "Qatar", EK: "Emirates", LH: "Lufthansa", BA: "British Airways",
  AF: "Air France", SQ: "Singapore", CX: "Cathay Pacific",
  NH: "ANA", JL: "JAL", TK: "Turkish", AZ: "ITA Airways",
  G3: "GOL", AD: "Azul", JJ: "TAM",
};

const CABIN_BY_AIRLINE = cabinQuality.reduce((acc, e) => {
  if (!acc[e.airline_code]) acc[e.airline_code] = e;
  return acc;
}, {});

const airlineLogo = (code) =>
  code ? `https://images.kiwi.com/airlines/64/${code}.png` : null;


export default function DealCard({ deal, onClick }) {
  const [showDetail, setShowDetail] = useState(false);

  const cabin   = CABIN_BY_AIRLINE[deal.airline_code] ?? null;
  const lounge  = loungeAccess[deal.airline_code] ?? null;
  const xfers   = transferPartners[deal.best_award_program] ?? [];
  const rec     = deal.ai_recommendation_en;

  // Savings vs Google typical
  const typicalMid = deal.typical_price_low && deal.typical_price_high
    ? (deal.typical_price_low + deal.typical_price_high) / 2
    : null;
  const savings = typicalMid ? Math.round(typicalMid - deal.best_price_usd) : null;
  const savingsPct = typicalMid ? Math.round((savings / typicalMid) * 100) : null;

  // Price delta vs previous scan
  const delta = deal.price_prev_usd != null
    ? Math.round(deal.best_price_usd - deal.price_prev_usd)
    : null;

  // Cold start: no history data yet
  const coldStart = deal.percentile_position == null && deal.zscore == null;

  const isGem = deal.is_gem;
  const isStrong = deal.action === "STRONG_BUY";
  const isBuy = deal.action === "BUY";

  return (
    <div
      className={`card-hover p-5 flex flex-col gap-3 cursor-pointer
        ${isGem ? "ring-2 ring-brand-500 ring-offset-2 ring-offset-white dark:ring-offset-zinc-950" : ""}`}
      onClick={() => onClick ? onClick(deal) : setShowDetail(v => !v)}
    >
      {/* ── GEM banner ────────────────────────────────────────────────────── */}
      {isGem && (
        <div className="flex items-center gap-2 -mx-5 -mt-5 px-5 py-2.5
                        bg-brand-500 rounded-t-2xl">
          <span className="text-xs font-bold text-white tracking-wide">
            ✦ GEM DEAL — Not listed on Google Flights
          </span>
        </div>
      )}

      {/* ── Airline + route ───────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {deal.airline_code && (
            <img
              src={airlineLogo(deal.airline_code)}
              alt={deal.airline_code}
              className="w-9 h-9 rounded-lg object-contain bg-white dark:bg-zinc-800
                         border border-zinc-100 dark:border-zinc-700 p-1 flex-shrink-0"
              onError={e => { e.currentTarget.style.display = "none"; }}
            />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-white">
              <span className="text-base">{deal.origin}</span>
              <svg className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M2 7h10M8 3l4 4-4 4"/>
              </svg>
              <span className="text-base">{deal.destination}</span>
            </div>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
              {AIRLINE_NAME[deal.airline_code] ?? deal.airline_code ?? "Unknown airline"}
              {" · "}{CABIN_LABEL[deal.cabin_class] ?? deal.cabin_class}
              {deal.is_direct ? " · Direct" : ""}
              {deal.departure_date && (
                <>{" · "}{format(new Date(deal.departure_date), "d MMM yyyy")}</>
              )}
            </p>
          </div>
        </div>

        {/* Price */}
        <div className="text-right flex-shrink-0">
          <p className="text-2xl font-bold text-zinc-900 dark:text-white tabular-nums">
            ${deal.best_price_usd?.toLocaleString()}
          </p>
          {delta != null && (
            <p className={`text-xs font-medium tabular-nums mt-0.5 ${
              delta < 0 ? "text-emerald-500" : delta > 0 ? "text-red-500" : "text-zinc-400"
            }`}>
              {delta < 0 ? `↓ $${Math.abs(delta)}` : delta > 0 ? `↑ $${delta}` : "—"}
            </p>
          )}
        </div>
      </div>

      {/* ── Core value prop: savings vs Google typical ────────────────────── */}
      {savings != null && savings > 0 ? (
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl
                        bg-emerald-50 dark:bg-emerald-500/10
                        border border-emerald-200 dark:border-emerald-500/20">
          <div>
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              ${savings.toLocaleString()} below Google's typical price ({savingsPct}% off)
            </p>
            <p className="text-2xs text-emerald-600/70 dark:text-emerald-400/60 mt-0.5">
              Google typical: ${deal.typical_price_low?.toLocaleString()}–${deal.typical_price_high?.toLocaleString()}
            </p>
          </div>
          {deal.google_price_level === "low" && (
            <span className="ml-auto text-2xs font-bold text-emerald-700 dark:text-emerald-300
                             bg-emerald-100 dark:bg-emerald-500/20 px-2 py-0.5 rounded-md flex-shrink-0">
              Google: LOW ✓
            </span>
          )}
        </div>
      ) : deal.google_price_level === "low" ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl
                        bg-emerald-50 dark:bg-emerald-500/10
                        border border-emerald-200 dark:border-emerald-500/20">
          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            Google Flights rates this price as LOW
          </span>
        </div>
      ) : coldStart ? (
        <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">
          Building price baseline — comparisons improve after a few scans
        </p>
      ) : null}

      {/* ── Badges ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        {isStrong && !isGem && (
          <span className="badge-strong-buy">Strong Buy · {Math.round((deal.score_total / 170) * 100)}</span>
        )}
        {isBuy && !isStrong && (
          <span className="badge-buy">Buy · {Math.round((deal.score_total / 170) * 100)}</span>
        )}
        {deal.action === "WATCH" && (
          <span className="badge-watch">Watch · {Math.round((deal.score_total / 170) * 100)}</span>
        )}
        {!isGem && !isStrong && !isBuy && deal.action !== "WATCH" && !coldStart && (
          <span className="badge-normal">Score {Math.round((deal.score_total / 170) * 100)}/100</span>
        )}

        {deal.is_error_fare && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-2xs font-semibold
                           bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400
                           border border-red-200 dark:border-red-500/20">
            ⚠ Possible Error Fare
          </span>
        )}
        {deal.seats_remaining != null && deal.seats_remaining <= 5 && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-2xs font-semibold
                           bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400
                           border border-amber-200 dark:border-amber-500/20">
            {deal.seats_remaining} seat{deal.seats_remaining !== 1 ? "s" : ""} left
          </span>
        )}
        {deal.sources_confirmed?.map(src => (
          <span key={src} className="text-2xs px-2 py-0.5 rounded-md font-medium border
                                     bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400
                                     border-zinc-200 dark:border-zinc-700">
            {src}
          </span>
        ))}
      </div>

      {/* ── Cabin quality ─────────────────────────────────────────────────── */}
      {cabin && (
        <div className="flex items-center justify-between px-3 py-2 rounded-xl
                        bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-700/60">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-900 dark:text-white">
              {cabin.product_name}
            </span>
            {cabin.has_door && (
              <span className="text-2xs px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-500/10
                               text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                Private Door
              </span>
            )}
            <span className="text-2xs text-zinc-400 dark:text-zinc-500">
              {cabin.configuration} · {cabin.seat_type.replace("-", " ")}
            </span>
          </div>
          <span className="text-sm font-bold tabular-nums text-brand-500">
            {cabin.quality_score}
            <span className="text-2xs font-normal text-zinc-400">/100</span>
          </span>
        </div>
      )}

      {/* ── Lounge ────────────────────────────────────────────────────────── */}
      {lounge && (deal.cabin_class === "BUSINESS" || deal.cabin_class === "FIRST") && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-brand-500 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5zm1 7a1 1 0 0 1 1-1h8a1 1 0 0 1 0 2H4a1 1 0 0 1-1-1z"/>
          </svg>
          {lounge.name} included
        </p>
      )}

      {/* ── Fare brand ────────────────────────────────────────────────────── */}
      {deal.fare_brand_name && (
        <p className="text-xs text-brand-500 font-medium">{deal.fare_brand_name}</p>
      )}

      {/* ── Award ─────────────────────────────────────────────────────────── */}
      {deal.best_award_miles && (
        <div className="px-3 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60
                        border border-zinc-100 dark:border-zinc-700/60 space-y-1">
          <p className="text-xs text-zinc-600 dark:text-zinc-300">
            <span className="font-semibold text-zinc-900 dark:text-white">
              {deal.best_award_miles.toLocaleString()} miles
            </span>
            {" "}via {deal.best_award_program}
            {deal.best_cpp && (
              <span className="text-brand-500 ml-1.5">{deal.best_cpp.toFixed(1)}¢/pt</span>
            )}
          </p>
          {xfers.length > 0 && (
            <p className="text-2xs text-zinc-400 dark:text-zinc-500">
              Transfer from: {xfers.join(" · ")}
            </p>
          )}
        </div>
      )}

      {/* ── AI recommendation ─────────────────────────────────────────────── */}
      {rec && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed
                      border-t border-zinc-100 dark:border-zinc-800 pt-3">
          {rec}
        </p>
      )}

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-1 border-t border-zinc-100 dark:border-zinc-800">
        <span className="text-2xs text-zinc-400 dark:text-zinc-500">
          {coldStart ? "Monitoring — building baseline" : `Score ${Math.round((deal.score_total / 170) * 100)}/100`}
        </span>
        <span className="text-2xs text-zinc-400 dark:text-zinc-500">
          Tap for details ↗
        </span>
      </div>
    </div>
  );
}
