import clsx from "clsx";

const SOURCE_CONFIG = {
  amadeus: { label: "Amadeus", cls: "bg-violet-500/20 text-violet-300 border-violet-500/20" },
  google:  { label: "Google",  cls: "bg-blue-500/20 text-blue-300 border-blue-500/20" },
  kiwi:    { label: "Kiwi",    cls: "bg-teal-500/20 text-teal-300 border-teal-500/20" },
  duffel:  { label: "Duffel",  cls: "bg-orange-500/20 text-orange-300 border-orange-500/20" },
};

export default function SourceBadges({ sources = [] }) {
  if (!sources.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {sources.map((src) => {
        const cfg = SOURCE_CONFIG[src] ?? { label: src, cls: "bg-white/10 text-white/40 border-white/10" };
        return (
          <span
            key={src}
            className={clsx(
              "text-xs px-2 py-0.5 rounded-md font-sans font-medium border",
              cfg.cls
            )}
          >
            {cfg.label}
          </span>
        );
      })}
    </div>
  );
}
