import { format } from "date-fns";
import ScoreBadge from "./ScoreBadge";
import clsx from "clsx";

const CABIN_LABEL = {
  BUSINESS:        "Business",
  FIRST:           "First",
  PREMIUM_ECONOMY: "Premium Eco",
};

const SOURCE_COLORS = {
  amadeus: "bg-violet-500/20 text-violet-300",
  google:  "bg-blue-500/20 text-blue-300",
  kiwi:    "bg-teal-500/20 text-teal-300",
  duffel:  "bg-orange-500/20 text-orange-300",
};

export default function DealCard({ deal }) {
  const language = "en"; // TODO: pull from user store

  return (
    <div className="card-hover p-5 animate-slide-up">
      {/* ── Header row ───────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-serif text-xl font-light text-white">
              {deal.origin}
            </span>
            <span className="text-gold-500/60 text-sm">→</span>
            <span className="font-serif text-xl font-light text-white">
              {deal.destination}
            </span>
          </div>
          <p className="text-xs text-white/40 font-sans">
            {CABIN_LABEL[deal.cabin_class] ?? deal.cabin_class}
            {deal.departure_date && ` · ${format(new Date(deal.departure_date), "d MMM yyyy")}`}
          </p>
        </div>

        <div className="text-right flex-shrink-0">
          <p className="font-serif text-2xl font-light text-white">
            ${deal.best_price_usd?.toLocaleString()}
          </p>
          <p className="text-xs text-white/30 font-sans">per person</p>
        </div>
      </div>

      {/* ── Score + flags ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 mb-4">
        <ScoreBadge
          action={deal.action}
          score={deal.score_total}
          isGem={deal.is_gem}
        />
        {deal.is_error_fare && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-sans font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
            ⚠ Possible Error Fare
          </span>
        )}
        {deal.google_price_level === "low" && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-sans font-semibold bg-emerald-500/10 text-emerald-400/80 border border-emerald-500/20">
            Google: Low
          </span>
        )}
        {deal.seats_remaining && deal.seats_remaining <= 5 && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-sans font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
            {deal.seats_remaining} seat{deal.seats_remaining > 1 ? "s" : ""} left
          </span>
        )}
      </div>

      {/* ── Sources confirmed ─────────────────────────────────────────────── */}
      {deal.sources_confirmed?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {deal.sources_confirmed.map((src) => (
            <span
              key={src}
              className={clsx(
                "text-xs px-2 py-0.5 rounded-md font-sans font-medium",
                SOURCE_COLORS[src] ?? "bg-white/10 text-white/40"
              )}
            >
              {src}
            </span>
          ))}
        </div>
      )}

      {/* ── Fare brand ────────────────────────────────────────────────────── */}
      {deal.fare_brand_name && (
        <p className="text-xs text-gold-400/70 font-sans mb-3">
          ✦ {deal.fare_brand_name}
        </p>
      )}

      {/* ── Award alternative ─────────────────────────────────────────────── */}
      {deal.best_award_miles && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-gold-500/5 border border-gold-500/15">
          <span className="text-gold-500 text-sm">◈</span>
          <p className="text-xs font-sans text-white/60">
            <span className="text-white/80">{deal.best_award_miles?.toLocaleString()} miles</span>
            {" "}via {deal.best_award_program}
            {deal.best_cpp && (
              <span className="text-gold-400/80"> · {deal.best_cpp.toFixed(1)}¢/pt</span>
            )}
          </p>
        </div>
      )}

      {/* ── AI recommendation ─────────────────────────────────────────────── */}
      {(deal.ai_recommendation_en || deal.ai_recommendation_pt) && (
        <p className="text-xs text-white/50 font-sans leading-relaxed border-t border-surface-border pt-3 mt-1">
          {language === "pt" ? deal.ai_recommendation_pt : deal.ai_recommendation_en}
        </p>
      )}
    </div>
  );
}
