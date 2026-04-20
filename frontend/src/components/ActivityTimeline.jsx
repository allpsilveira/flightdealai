import { useEffect, useState, useCallback } from "react";
import { formatDistanceToNow, format } from "date-fns";
import api from "../lib/api";

// Icons
function IconUser() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-5 6a5 5 0 0 1 10 0H3z" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
         strokeLinecap="round" className="w-3.5 h-3.5">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3.2l2 1.3" />
    </svg>
  );
}

function IconAirflow() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 2a5 5 0 1 1 0 10A5 5 0 0 1 8 3zm-.5 2v3.3l2.3 1.4-.8 1.2-2.8-1.7V5h1.3z" />
    </svg>
  );
}

function IconWarning() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M8 1.5a.5.5 0 0 1 .44.26l6 11A.5.5 0 0 1 14 13.5H2a.5.5 0 0 1-.44-.74l6-11A.5.5 0 0 1 8 1.5zM8 6a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 1 0v-3A.5.5 0 0 0 8 6zm0 5.5a.6.6 0 1 0 0 1.2.6.6 0 0 0 0-1.2z" />
    </svg>
  );
}

const TRIGGER_CONFIG = {
  manual: {
    label:      "You · Scan Now",
    sublabel:   "Manual scan",
    dotBg:      "bg-champagne",
    iconBg:     "bg-champagne/20",
    iconColor:  "text-champagne",
    badgeBg:    "bg-champagne/10 border border-champagne/30",
    badgeText:  "text-champagne",
    Icon:       IconUser,
  },
  scheduled: {
    label:      "Scheduled · Auto",
    sublabel:   "Automatic scan",
    dotBg:      "bg-zinc-400 dark:bg-zinc-500",
    iconBg:     "bg-zinc-200 dark:bg-zinc-700",
    iconColor:  "text-zinc-500 dark:text-zinc-400",
    badgeBg:    "bg-zinc-100 dark:bg-zinc-800",
    badgeText:  "text-zinc-500 dark:text-zinc-400",
    Icon:       IconClock,
  },
  airflow: {
    label:      "Airflow · Auto",
    sublabel:   "Scheduled DAG",
    dotBg:      "bg-indigo-400 dark:bg-indigo-500",
    iconBg:     "bg-indigo-100 dark:bg-indigo-500/20",
    iconColor:  "text-indigo-600 dark:text-indigo-400",
    badgeBg:    "bg-indigo-50 dark:bg-indigo-500/15",
    badgeText:  "text-indigo-600 dark:text-indigo-400",
    Icon:       IconAirflow,
  },
};

const STATUS_OVERRIDE = {
  error: {
    iconBg:    "bg-red-100 dark:bg-red-500/20",
    iconColor: "text-red-500 dark:text-red-400",
    dotBg:     "bg-red-500",
    Icon:      IconWarning,
  },
  partial: {
    iconBg:    "bg-amber-100 dark:bg-amber-500/20",
    iconColor: "text-amber-600 dark:text-amber-400",
    dotBg:     "bg-amber-400",
    Icon:      IconWarning,
  },
};

const getTrigger = (type) => TRIGGER_CONFIG[type] ?? TRIGGER_CONFIG.scheduled;

const FILTERS = [
  { key: "all",     label: "All" },
  { key: "manual",  label: "Manual" },
  { key: "auto",    label: "Scheduled" },
  { key: "error",   label: "Failed" },
];

export default function ActivityTimeline({ routeId, onEventClick, refreshKey = 0 }) {
  const [scans,      setScans]   = useState(null);
  const [error,      setError]   = useState(false);
  const [filter,     setFilter]  = useState("all");

  const reload = useCallback(() => {
    if (!routeId) return;
    setScans(null);
    setError(false);
    api.get("/scan/history", { params: { route_id: routeId, limit: 50 } })
      .then((r) => setScans(r.data))
      .catch(() => { setScans([]); setError(true); });
  }, [routeId]);

  // Reload when route changes OR when parent signals a refresh (e.g. after scan)
  useEffect(() => { reload(); }, [reload, refreshKey]);

  // Apply filter
  const visible = (scans ?? []).filter((s) => {
    if (filter === "all")    return true;
    if (filter === "error")  return s.status === "error" || s.status === "partial";
    if (filter === "manual") return s.trigger_type === "manual";
    if (filter === "auto")   return s.trigger_type !== "manual";
    return true;
  });

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4 flex-wrap">
        {FILTERS.map(({ key, label }) => {
          const count = key === "all"
            ? (scans ?? []).length
            : key === "error"
            ? (scans ?? []).filter(s => s.status === "error" || s.status === "partial").length
            : key === "manual"
            ? (scans ?? []).filter(s => s.trigger_type === "manual").length
            : (scans ?? []).filter(s => s.trigger_type !== "manual").length;

          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5
                ${filter === key
                  ? key === "error"
                    ? "bg-red-500/15 text-red-300 border border-red-500/30"
                    : "bg-champagne/15 text-champagne border border-champagne/30"
                  : "border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
                }`}
            >
              {label}
              {scans !== null && count > 0 && (
                <span className={`text-2xs tabular-nums ${filter === key ? "opacity-80" : "opacity-60"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}

        {/* Reload button */}
        <button
          onClick={reload}
          className="ml-auto text-xs text-zinc-500 hover:text-champagne transition-colors"
          title="Refresh timeline"
        >
          ↺ Refresh
        </button>
      </div>

      {/* Loading skeleton */}
      {scans === null && (
        <div className="space-y-5 animate-pulse px-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 flex-shrink-0" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded w-1/3" />
                <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded w-2/3" />
                <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {scans !== null && visible.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-3">
            <IconClock />
          </div>
          {scans.length === 0 ? (
            <>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white mb-1">No activity yet</p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                Click "Scan Now" to run the first scan. All activity will appear here.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white mb-1">No results for this filter</p>
              <button onClick={() => setFilter("all")} className="text-xs text-champagne hover:text-champagne/80 mt-1">
                Show all
              </button>
            </>
          )}
        </div>
      )}

      {/* Timeline */}
      {scans !== null && visible.length > 0 && (
        <div className="relative">
          {/* Vertical guide line */}
          <div className="absolute left-[13px] top-8 bottom-2 w-px bg-zinc-100 dark:bg-zinc-800 pointer-events-none" />

          <div className="space-y-1">
            {visible.map((scan) => {
              const ts        = new Date(scan.triggered_at);
              const base      = getTrigger(scan.trigger_type);
              const override  = STATUS_OVERRIDE[scan.status] ?? {};
              const cfg       = { ...base, ...override };
              const { Icon }  = cfg;
              const isFailed  = scan.status === "error";
              const isPartial = scan.status === "partial";
              const isOk      = !isFailed && !isPartial;
              const clickable = isOk && scan.deals_scored > 0;

              return (
                <div
                  key={scan.id}
                  className={`flex gap-3 px-1 py-3 rounded-xl transition-colors
                    ${clickable ? "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer" : ""}
                    ${isFailed  ? "bg-red-50/40 dark:bg-red-500/5" : ""}
                    ${isPartial ? "bg-amber-50/40 dark:bg-amber-500/5" : ""}
                  `}
                  onClick={() => { if (clickable && onEventClick) onEventClick(scan); }}
                >
                  {/* Icon circle */}
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0
                                   ${cfg.iconBg} ${cfg.iconColor}`}>
                    <Icon />
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Top row */}
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className={`text-2xs font-bold px-2 py-0.5 rounded-full ${base.badgeBg} ${base.badgeText}`}>
                        {base.label}
                      </span>
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">
                        {formatDistanceToNow(ts, { addSuffix: true })}
                      </span>
                    </div>

                    {/* Headline */}
                    <p className="text-sm font-semibold leading-snug">
                      {isFailed
                        ? <span className="text-red-600 dark:text-red-400">
                            Scan failed — no prices returned
                          </span>
                        : isPartial
                        ? <span className="text-amber-600 dark:text-amber-400">
                            Partial — {scan.prices_collected} price{scan.prices_collected !== 1 ? "s" : ""} collected, scoring failed
                          </span>
                        : scan.deals_scored > 0
                        ? <span className="text-zinc-900 dark:text-white">
                            {scan.deals_scored} deal{scan.deals_scored !== 1 ? "s" : ""} scored
                            {scan.best_price_usd
                              ? <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">
                                  · Best ${Math.round(scan.best_price_usd).toLocaleString()}
                                </span>
                              : ""}
                          </span>
                        : <span className="text-zinc-500 dark:text-zinc-400 font-normal">
                            Scan complete — no new deals
                          </span>
                      }
                    </p>

                    {/* Detail line */}
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span>{format(ts, "d MMM yyyy, HH:mm")}</span>
                      {scan.origins && scan.destinations && (
                        <>
                          <span className="text-zinc-300 dark:text-zinc-700">·</span>
                          <span>{scan.origins} → {scan.destinations}</span>
                        </>
                      )}
                      {isOk && scan.prices_collected > 0 && (
                        <>
                          <span className="text-zinc-300 dark:text-zinc-700">·</span>
                          <span>{scan.prices_collected} price{scan.prices_collected !== 1 ? "s" : ""} collected</span>
                        </>
                      )}
                      {isFailed && (
                        <>
                          <span className="text-zinc-300 dark:text-zinc-700">·</span>
                          <span className="text-red-400 dark:text-red-500">Check API quota or key</span>
                        </>
                      )}
                    </p>
                  </div>

                  {/* Right badge */}
                  {isFailed && (
                    <div className="flex-shrink-0 self-center w-5 h-5 rounded-full bg-red-500
                                    flex items-center justify-center">
                      <span className="text-white text-2xs font-bold">!</span>
                    </div>
                  )}
                  {isPartial && (
                    <div className="flex-shrink-0 self-center w-5 h-5 rounded-full bg-amber-400
                                    flex items-center justify-center">
                      <span className="text-white text-2xs font-bold">~</span>
                    </div>
                  )}
                  {isOk && scan.deals_scored > 0 && (
                    <div className={`flex-shrink-0 self-center w-5 h-5 rounded-full flex items-center
                                    justify-center text-2xs font-bold text-white ${cfg.dotBg}`}>
                      {scan.deals_scored > 9 ? "9+" : scan.deals_scored}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Legend */}
            <div className="flex items-center gap-4 flex-wrap pt-3 pb-1 px-1
                            border-t border-zinc-100 dark:border-zinc-800 mt-2">
              {Object.entries(TRIGGER_CONFIG).map(([key, cfg]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <div className={`w-3 h-3 rounded-full ${cfg.dotBg}`} />
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">{cfg.sublabel}</span>
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-xs text-zinc-400 dark:text-zinc-500">Failed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-amber-400" />
                <span className="text-xs text-zinc-400 dark:text-zinc-500">Partial</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
