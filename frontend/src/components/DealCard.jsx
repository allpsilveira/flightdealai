import { format } from "date-fns";
import ScoreBadge from "./ScoreBadge";

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

export default function DealCard({ deal }) {
  const language = "en";
  const rec = language === "pt" ? deal.ai_recommendation_pt : deal.ai_recommendation_en;

  return (
    <div className="card-hover p-5 animate-slide-up">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 mb-4">
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
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            {CABIN_LABEL[deal.cabin_class] ?? deal.cabin_class}
            {deal.departure_date && (
              <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">·</span>
            )}
            {deal.departure_date && format(new Date(deal.departure_date), "d MMM yyyy")}
          </p>
        </div>

        <div className="text-right flex-shrink-0">
          <p className="text-2xl font-bold text-zinc-900 dark:text-white tabular-nums">
            ${deal.best_price_usd?.toLocaleString()}
          </p>
          <p className="text-2xs text-zinc-400 dark:text-zinc-500 mt-0.5">per person</p>
        </div>
      </div>

      {/* ── Badges ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <ScoreBadge action={deal.action} score={deal.score_total} isGem={deal.is_gem} />

        {deal.is_error_fare && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-2xs font-semibold
                           bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400
                           border border-red-200 dark:border-red-500/20">
            ⚠ Possible Error Fare
          </span>
        )}
        {deal.google_price_level === "low" && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-2xs font-semibold
                           bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400
                           border border-emerald-200 dark:border-emerald-500/20">
            Google: Low
          </span>
        )}
        {deal.seats_remaining != null && deal.seats_remaining <= 5 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-2xs font-semibold
                           bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400
                           border border-amber-200 dark:border-amber-500/20">
            {deal.seats_remaining} seat{deal.seats_remaining !== 1 ? "s" : ""} left
          </span>
        )}
      </div>

      {/* ── Sources ───────────────────────────────────────────────────────── */}
      {deal.sources_confirmed?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {deal.sources_confirmed.map((src) => (
            <span
              key={src}
              className={`text-2xs px-2 py-0.5 rounded-md font-medium border ${SOURCE_STYLE[src] ?? "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700"}`}
            >
              {src}
            </span>
          ))}
        </div>
      )}

      {/* ── Fare brand ────────────────────────────────────────────────────── */}
      {deal.fare_brand_name && (
        <p className="text-xs text-brand-500 dark:text-brand-400 font-medium mb-3">
          {deal.fare_brand_name}
        </p>
      )}

      {/* ── Award alternative ─────────────────────────────────────────────── */}
      {deal.best_award_miles && (
        <div className="flex items-center gap-2.5 mb-3 px-3 py-2.5 rounded-xl
                        bg-sand-100 dark:bg-zinc-800
                        border border-sand-200 dark:border-zinc-700">
          <div className="w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />
          <p className="text-xs text-zinc-600 dark:text-zinc-300">
            <span className="font-semibold text-zinc-900 dark:text-white">
              {deal.best_award_miles?.toLocaleString()} miles
            </span>
            {" "}via {deal.best_award_program}
            {deal.best_cpp && (
              <span className="text-brand-500 dark:text-brand-400 ml-1.5">
                {deal.best_cpp.toFixed(1)}¢/pt
              </span>
            )}
          </p>
        </div>
      )}

      {/* ── AI recommendation ─────────────────────────────────────────────── */}
      {rec && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed
                      border-t border-zinc-100 dark:border-zinc-800 pt-3 mt-1">
          {rec}
        </p>
      )}
    </div>
  );
}
