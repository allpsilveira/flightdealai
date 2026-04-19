import FormattedText from "./FormattedText";

/**
 * Standalone AI insight card shown on Route Detail.
 * Picks the best available recommendation in user's preferred language.
 */
export default function AIInsightPanel({ deal, language = "en" }) {
  if (!deal) return null;

  const text = (language === "pt" ? deal.ai_recommendation_pt : deal.ai_recommendation_en)
            ?? deal.ai_recommendation_en
            ?? deal.ai_recommendation_pt;

  if (!text) return null;

  return (
    <div className="card p-4 border-l-2 border-brand-500/60">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          AI Analysis
        </p>
        {deal.is_gem && (
          <span className="text-2xs font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-500">
            Gem
          </span>
        )}
        {deal.is_error_fare && (
          <span className="text-2xs font-bold uppercase px-1.5 py-0.5 rounded-full bg-red-400/20 text-red-500">
            Error fare?
          </span>
        )}
      </div>
      <FormattedText text={text} className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed" />
    </div>
  );
}
