import clsx from "clsx";

const ACTION_CONFIG = {
  STRONG_BUY: { cls: "badge-strong-buy", label: "Strong Buy" },
  BUY:        { cls: "badge-buy",        label: "Buy" },
  WATCH:      { cls: "badge-watch",      label: "Watch" },
  NORMAL:     { cls: "badge-normal",     label: "Normal" },
  SKIP:       { cls: "badge-normal",     label: "Skip" },
};

export default function ScoreBadge({ action, score, isGem }) {
  if (isGem) {
    return (
      <span className="badge-gem">
        ✦ GEM · {Math.round(score)}
      </span>
    );
  }

  const cfg = ACTION_CONFIG[action] ?? ACTION_CONFIG.NORMAL;
  return (
    <span className={cfg.cls}>
      {cfg.label} · {Math.round(score)}
    </span>
  );
}
