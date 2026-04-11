import clsx from "clsx";

const TREND_CONFIG = {
  low:     { arrow: "↓↓", label: "Falling fast", cls: "text-emerald-400" },
  dropping:{ arrow: "↓",  label: "Dropping",     cls: "text-emerald-300" },
  stable:  { arrow: "→",  label: "Stable",        cls: "text-white/40" },
  rising:  { arrow: "↑",  label: "Rising",        cls: "text-amber-400" },
  spiking: { arrow: "↑↑", label: "Spiking",       cls: "text-red-400" },
};

export default function TrendArrow({ trend, showLabel = false }) {
  if (!trend) return null;
  const cfg = TREND_CONFIG[trend] ?? TREND_CONFIG.stable;
  return (
    <span className={clsx("font-sans font-medium", cfg.cls)} title={cfg.label}>
      {cfg.arrow}{showLabel && <span className="ml-1 text-xs opacity-70">{cfg.label}</span>}
    </span>
  );
}
