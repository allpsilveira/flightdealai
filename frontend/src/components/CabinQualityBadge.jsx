import clsx from "clsx";

function scoreColor(score) {
  if (score >= 95) return "text-gold-400 border-gold-500/40 bg-gold-500/10";
  if (score >= 85) return "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
  if (score >= 75) return "text-blue-400 border-blue-500/30 bg-blue-500/10";
  return "text-white/50 border-white/10 bg-white/5";
}

export default function CabinQualityBadge({ productName, qualityScore, hasDoor }) {
  if (!productName) return null;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-sans font-medium border",
        scoreColor(qualityScore ?? 0)
      )}
      title={`Quality score: ${qualityScore}/100`}
    >
      {hasDoor && <span title="Has door">🚪</span>}
      {productName}
      {qualityScore && (
        <span className="opacity-60 font-normal">· {qualityScore}</span>
      )}
    </span>
  );
}
