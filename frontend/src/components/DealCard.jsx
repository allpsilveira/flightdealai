import { useState } from "react";
import { format } from "date-fns";
import ScoreBadge from "./ScoreBadge";
import cabinQuality from "../data/cabin_quality.json";
import transferPartners from "../data/transfer_partners.json";
import loungeAccess from "../data/lounge_access.json";

const CABIN_LABEL = {
  BUSINESS:        "Business",
  FIRST:           "First Class",
  PREMIUM_ECONOMY: "Premium Economy",
};

const SOURCE_STYLE = {
  serpapi: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/20",
  duffel:  "bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 border-brand-200 dark:border-brand-500/20",
  awards:  "bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-500/20",
};

const QUALITY_COLOR = (score) => {
  if (score >= 92) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 82) return "text-brand-500 dark:text-brand-400";
  if (score >= 72) return "text-amber-600 dark:text-amber-500";
  return "text-zinc-500 dark:text-zinc-400";
};

// Build a lookup: airline_code → cabin entry (first match per airline)
const CABIN_BY_AIRLINE = cabinQuality.reduce((acc, entry) => {
  if (!acc[entry.airline_code]) acc[entry.airline_code] = entry;
  return acc;
}, {});

export default function DealCard({ deal }) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  const language = "en";
  const rec = language === "pt" ? deal.ai_recommendation_pt : deal.ai_recommendation_en;

  // ── Cabin quality enrichment ─────────────────────────────────────────────
  const cabin = deal.airline_code ? CABIN_BY_AIRLINE[deal.airline_code] : null;

  // ── Transfer partners for award program ──────────────────────────────────
  const xfers = deal.best_award_program ? (transferPartners[deal.best_award_program] ?? []) : [];

  // ── Lounge info ──────────────────────────────────────────────────────────
  const lounge = deal.airline_code ? loungeAccess[deal.airline_code] : null;
  const loungeIncluded = lounge && (deal.cabin_class === "BUSINESS" || deal.cabin_class === "FIRST");

  // ── Price context ────────────────────────────────────────────────────────
  const hasContext = deal.percentile_position != null || deal.zscore != null;

  // ── Score sub-components (non-zero only) ─────────────────────────────────
  const scoreRows = [
    { label: "Percentile",      value: deal.score_percentile },
    { label: "Z-score signal",  value: deal.score_zscore },
    { label: "Trend direction", value: deal.score_trend_direction },
    { label: "Cross-source",    value: deal.score_cross_source },
    { label: "Arbitrage",       value: deal.score_arbitrage },
    { label: "Award bonus",     value: deal.score_award },
  ].filter(r => r.value > 0);

  return (
    <div className="card-hover p-5 animate-slide-up flex flex-col gap-4">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg font-semibold text-zinc-900 dark:text-white tracking-tight">
              {deal.origin}
            </span>
            <svg className="w-4 h-4 text-brand-500 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 8h10M9 4l4 4-4 4"/>
            </svg>
            <span className="text-lg font-semibold text-zinc-900 dark:text-white tracking-tight">
              {deal.destination}
            </span>
            {deal.airline_code && (
              <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-md">
                {deal.airline_code}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            {CABIN_LABEL[deal.cabin_class] ?? deal.cabin_class}
            {deal.departure_date && (
              <>
                <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">·</span>
                {format(new Date(deal.departure_date), "d MMM yyyy")}
              </>
            )}
          </p>
        </div>

        <div className="text-right flex-shrink-0">
          <p className="text-2xl font-bold text-zinc-900 dark:text-white tabular-nums">
            ${deal.best_price_usd?.toLocaleString()}
          </p>
          <p className="text-2xs text-zinc-400 dark:text-zinc-500 mt-0.5">per person</p>
        </div>
      </div>

      {/* ── Price context ─────────────────────────────────────────────────── */}
      {hasContext && (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {deal.percentile_position != null && (
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
              Bottom {Math.round(deal.percentile_position)}% of 90-day prices
            </span>
          )}
          {deal.zscore != null && deal.zscore < 0 && (
            <span className="text-zinc-400 dark:text-zinc-500">
              {Math.abs(deal.zscore).toFixed(1)}σ below average
            </span>
          )}
          {deal.google_price_level && (
            <span className={
              deal.google_price_level === "low"    ? "text-emerald-600 dark:text-emerald-400" :
              deal.google_price_level === "high"   ? "text-red-500 dark:text-red-400" :
              "text-zinc-400 dark:text-zinc-500"
            }>
              Google: {deal.google_price_level}
            </span>
          )}
        </div>
      )}

      {/* ── Action badges ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        <ScoreBadge action={deal.action} score={deal.score_total} isGem={deal.is_gem} />

        {deal.is_error_fare && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-2xs font-semibold
                           bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400
                           border border-red-200 dark:border-red-500/20">
            ⚠ Possible Error Fare
          </span>
        )}
        {deal.seats_remaining != null && deal.seats_remaining <= 5 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-2xs font-semibold
                           bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400
                           border border-amber-200 dark:border-amber-500/20">
            {deal.seats_remaining} seat{deal.seats_remaining !== 1 ? "s" : ""} left
          </span>
        )}
        {deal.sources_confirmed?.map((src) => (
          <span key={src} className={`text-2xs px-2 py-0.5 rounded-md font-medium border ${SOURCE_STYLE[src] ?? "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700"}`}>
            {src}
          </span>
        ))}
      </div>

      {/* ── Cabin quality ─────────────────────────────────────────────────── */}
      {cabin && (
        <div className="flex items-center justify-between px-3 py-2.5 rounded-xl
                        bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-700/60">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-900 dark:text-white">
              {cabin.product_name}
            </span>
            {cabin.has_door && (
              <span className="text-2xs px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-500/10
                               text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 font-medium">
                Door
              </span>
            )}
            <span className="text-2xs text-zinc-400 dark:text-zinc-500">
              {cabin.configuration} · {cabin.seat_type.replace("-", " ")}
            </span>
          </div>
          <span className={`text-sm font-bold tabular-nums ${QUALITY_COLOR(cabin.quality_score)}`}>
            {cabin.quality_score}
            <span className="text-2xs font-normal text-zinc-400 dark:text-zinc-500">/100</span>
          </span>
        </div>
      )}

      {/* ── Lounge ────────────────────────────────────────────────────────── */}
      {loungeIncluded && (
        <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <svg className="w-3.5 h-3.5 text-brand-500 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5zm1 7a1 1 0 0 1 1-1h8a1 1 0 0 1 0 2H4a1 1 0 0 1-1-1z"/>
          </svg>
          <span>{lounge.name} included</span>
          {lounge.pp_partner && (
            <span className="text-2xs px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800
                             text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
              Priority Pass
            </span>
          )}
        </div>
      )}

      {/* ── Fare brand ────────────────────────────────────────────────────── */}
      {deal.fare_brand_name && (
        <p className="text-xs text-brand-500 dark:text-brand-400 font-medium -mt-1">
          {deal.fare_brand_name}
        </p>
      )}

      {/* ── Award alternative ─────────────────────────────────────────────── */}
      {deal.best_award_miles && (
        <div className="px-3 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60
                        border border-zinc-100 dark:border-zinc-700/60 space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />
            <p className="text-xs text-zinc-600 dark:text-zinc-300">
              <span className="font-semibold text-zinc-900 dark:text-white">
                {deal.best_award_miles?.toLocaleString()} miles
              </span>
              {" "}via {deal.best_award_program}
              {deal.best_cpp && (
                <span className="text-brand-500 dark:text-brand-400 ml-1.5 font-medium">
                  {deal.best_cpp.toFixed(1)}¢/pt
                </span>
              )}
            </p>
          </div>
          {xfers.length > 0 && (
            <p className="text-2xs text-zinc-400 dark:text-zinc-500 pl-3.5">
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

      {/* ── Score breakdown (expandable) ──────────────────────────────────── */}
      {scoreRows.length > 0 && (
        <div className="border-t border-zinc-100 dark:border-zinc-800 pt-2">
          <button
            onClick={() => setShowBreakdown(v => !v)}
            className="text-2xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300
                       transition-colors flex items-center gap-1"
          >
            {showBreakdown ? "▴" : "▾"} Score breakdown
          </button>
          {showBreakdown && (
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
              {scoreRows.map(({ label, value }) => (
                <div key={label} className="flex justify-between text-2xs">
                  <span className="text-zinc-400 dark:text-zinc-500">{label}</span>
                  <span className="font-medium text-zinc-700 dark:text-zinc-300 tabular-nums">
                    +{Math.round(value)}
                  </span>
                </div>
              ))}
              <div className="col-span-2 flex justify-between text-2xs pt-1 border-t border-zinc-100 dark:border-zinc-800 mt-0.5">
                <span className="font-semibold text-zinc-600 dark:text-zinc-400">Total</span>
                <span className="font-bold text-zinc-900 dark:text-white tabular-nums">
                  {Math.round(deal.score_total)}/170
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
