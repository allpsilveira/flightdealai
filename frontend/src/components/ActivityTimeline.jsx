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

const TRIGGER_CONFIG = {
  manual: {
    label:      "You · Scan Now",
    sublabel:   "Manual scan",
    dotBg:      "bg-brand-500",
    iconBg:     "bg-brand-500",
    iconColor:  "text-white",
    badgeBg:    "bg-brand-50 dark:bg-brand-500/15",
    badgeText:  "text-brand-600 dark:text-brand-400",
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

const getTrigger = (type) => TRIGGER_CONFIG[type] ?? TRIGGER_CONFIG.scheduled;

export default function ActivityTimeline({ routeId, onEventClick }) {
  const [scans,   setScans]   = useState(null);
  const [error,   setError]   = useState(false);

  const reload = useCallback(() => {
    if (!routeId) return;
    setScans(null);
    api.get("/scan/history", { params: { route_id: routeId, limit: 30 } })
      .then((r) => setScans(r.data))
      .catch(() => { setScans([]); setError(true); });
  }, [routeId]);

  useEffect(() => { reload(); }, [reload]);

  if (scans === null) {
    return (
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
    );
  }

  if (scans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-3">
          <IconClock />
        </div>
        <p className="text-sm font-semibold text-zinc-900 dark:text-white mb-1">No scans yet</p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Click "Scan Now" to run the first scan. Activity will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical guide line */}
      <div className="absolute left-[13px] top-8 bottom-2 w-px bg-zinc-100 dark:bg-zinc-800 pointer-events-none" />

      <div className="space-y-1">
        {scans.map((scan, i) => {
          const ts      = new Date(scan.triggered_at);
          const cfg     = getTrigger(scan.trigger_type);
          const { Icon } = cfg;
          const isLast  = i === scans.length - 1;

          return (
            <div
              key={scan.id}
              className={`flex gap-3 px-1 py-3 rounded-xl transition-colors
                ${scan.deals_scored > 0
                  ? "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer"
                  : ""
                }`}
              onClick={() => {
                if (scan.deals_scored > 0 && onEventClick) {
                  onEventClick(scan);
                }
              }}
            >
              {/* Icon circle */}
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0
                               ${cfg.iconBg} ${cfg.iconColor}`}>
                <Icon />
              </div>

              <div className="flex-1 min-w-0">
                {/* Top row: trigger label + relative time + badge */}
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className={`text-2xs font-bold px-2 py-0.5 rounded-full ${cfg.badgeBg} ${cfg.badgeText}`}>
                    {cfg.label}
                  </span>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">
                    {formatDistanceToNow(ts, { addSuffix: true })}
                  </span>
                </div>

                {/* Headline */}
                <p className="text-sm font-semibold text-zinc-900 dark:text-white leading-snug">
                  {scan.deals_scored > 0
                    ? <>
                        {scan.deals_scored} deal{scan.deals_scored !== 1 ? "s" : ""} scored
                        {scan.best_price_usd
                          ? <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">
                              · Best ${Math.round(scan.best_price_usd).toLocaleString()}
                            </span>
                          : ""}
                      </>
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
                  {scan.prices_collected > 0 && (
                    <>
                      <span className="text-zinc-300 dark:text-zinc-700">·</span>
                      <span>{scan.prices_collected} price{scan.prices_collected !== 1 ? "s" : ""} collected</span>
                    </>
                  )}
                </p>
              </div>

              {/* Right: deal count dot or nothing */}
              {scan.deals_scored > 0 && (
                <div className="flex-shrink-0 self-center">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-2xs font-bold
                                  text-white ${cfg.dotBg}`}>
                    {scan.deals_scored > 9 ? "9+" : scan.deals_scored}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Legend */}
        <div className="flex items-center gap-4 flex-wrap pt-3 pb-1 px-1 border-t border-zinc-100 dark:border-zinc-800 mt-2">
          {Object.entries(TRIGGER_CONFIG).map(([key, cfg]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-full ${cfg.dotBg}`} />
              <span className="text-xs text-zinc-400 dark:text-zinc-500">{cfg.sublabel}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
