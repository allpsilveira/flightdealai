import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

const CABIN_LABEL = {
  BUSINESS: "Business",
  FIRST: "First",
  PREMIUM_ECONOMY: "Prem Eco",
};

const TIER_STYLE = {
  HOT:  "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/20",
  WARM: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20",
  COLD: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/20",
};

const airlineLogo = (code) =>
  code ? `https://images.kiwi.com/airlines/64/${code}.png` : null;

export default function RouteCard({ route, deal, scanning, onScan }) {
  const navigate = useNavigate();

  // Urgency border: left-4 colored strip
  let borderCls = "border-l-zinc-200 dark:border-l-zinc-700";
  if (deal) {
    if (deal.is_error_fare || deal.action === "STRONG_BUY")
      borderCls = "border-l-red-400";
    else if (deal.is_gem || deal.action === "BUY")
      borderCls = "border-l-emerald-400";
    else if (deal.best_award_miles)
      borderCls = "border-l-amber-400";
  }

  const displayScore = deal
    ? Math.round((deal.score_total / 170) * 100)
    : null;

  const priceDelta =
    deal?.price_prev_usd != null
      ? Math.round(deal.best_price_usd - deal.price_prev_usd)
      : null;

  return (
    <div
      className={`card p-0 overflow-hidden cursor-pointer group border-l-4 ${borderCls} transition-all`}
      onClick={() => navigate(`/route/${route.id}`)}
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-semibold text-sm text-zinc-900 dark:text-white truncate">
                {route.name}
              </span>
              <span
                className={`text-2xs px-2 py-0.5 rounded-md font-semibold border flex-shrink-0
                  ${TIER_STYLE[route.priority_tier] ?? TIER_STYLE.WARM}`}
              >
                {route.priority_tier}
              </span>
              {!route.is_active && (
                <span className="text-2xs px-2 py-0.5 rounded-md flex-shrink-0
                                 bg-zinc-100 dark:bg-zinc-800 text-zinc-400
                                 border border-zinc-200 dark:border-zinc-700">
                  Paused
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {route.origins.join(", ")} → {route.destinations.join(", ")}
              {" · "}
              {route.cabin_classes.map((c) => CABIN_LABEL[c] ?? c).join(", ")}
            </p>
          </div>

          {/* Scan button */}
          <button
            onClick={(e) => { e.stopPropagation(); onScan?.(); }}
            disabled={scanning}
            className="btn-ghost text-xs py-1 px-2.5 flex-shrink-0 disabled:opacity-50"
          >
            {scanning ? (
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/>
                </svg>
                Scanning
              </span>
            ) : "Scan Now"}
          </button>
        </div>

        {/* Best deal summary */}
        <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800">
          {deal ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                {deal.airline_code && (
                  <img
                    src={airlineLogo(deal.airline_code)}
                    alt={deal.airline_code}
                    className="w-8 h-8 rounded-lg object-contain bg-white dark:bg-zinc-800
                               border border-zinc-100 dark:border-zinc-700 p-1 flex-shrink-0"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                )}
                <div className="min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-bold text-zinc-900 dark:text-white tabular-nums">
                      ${deal.best_price_usd?.toLocaleString()}
                    </span>
                    {priceDelta != null && (
                      <span className={`text-xs font-medium tabular-nums ${
                        priceDelta < 0 ? "text-emerald-500"
                        : priceDelta > 0 ? "text-red-500"
                        : "text-zinc-400"
                      }`}>
                        {priceDelta < 0 ? `↓$${Math.abs(priceDelta)}` : priceDelta > 0 ? `↑$${priceDelta}` : "—"}
                      </span>
                    )}
                  </div>
                  <p className="text-2xs text-zinc-400 dark:text-zinc-500 truncate">
                    {deal.departure_date
                      ? format(new Date(deal.departure_date), "d MMM")
                      : ""}
                    {deal.is_direct ? " · Direct" : ""}
                    {deal.google_price_level === "low" && (
                      <span className="text-emerald-500 font-medium"> · Google: LOW</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="text-right flex-shrink-0 space-y-0.5">
                {displayScore != null && (
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-2xs font-bold ${
                      displayScore >= 70
                        ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20"
                        : displayScore >= 50
                        ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20"
                        : "bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700"
                    }`}
                  >
                    {displayScore}/100
                  </span>
                )}
                {deal.is_gem && (
                  <p className="text-2xs text-brand-500 font-semibold">✦ GEM</p>
                )}
                {deal.best_award_miles && (
                  <p className="text-2xs text-amber-500">
                    {deal.best_award_miles.toLocaleString()} mi
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-zinc-400 dark:text-zinc-500 italic">
              No prices yet — hit Scan Now to fetch data
            </p>
          )}
        </div>
      </div>

      {/* Footer hint */}
      <div className="px-5 py-2 bg-zinc-50/60 dark:bg-zinc-900/40 border-t border-zinc-100 dark:border-zinc-800
                      group-hover:bg-brand-50/50 dark:group-hover:bg-brand-500/5 transition-colors">
        <p className="text-2xs text-zinc-400 dark:text-zinc-500">
          View chart, timeline &amp; all options →
        </p>
      </div>
    </div>
  );
}
