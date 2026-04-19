import { useEffect, useState } from "react";
import { format, parseISO, addDays, startOfDay } from "date-fns";
import api from "../lib/api";

const LEVEL_COLOR = {
  cheap:     "bg-emerald-500/80 hover:bg-emerald-500 text-white",
  normal:    "bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-200",
  expensive: "bg-red-500/70 hover:bg-red-500 text-white",
};

const LEVEL_DOT = {
  cheap:     "bg-emerald-500",
  normal:    "bg-zinc-400 dark:bg-zinc-500",
  expensive: "bg-red-500",
};

/**
 * Horizontal scrollable 60-day calendar showing cheapest known price per date.
 * Pulls /api/prices/cheapest-dates/{routeId}
 */
export default function CheapestDateStrip({ routeId, cabinClass, origin, destination, onSelectDate }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    if (!routeId || !cabinClass) return;
    setLoading(true);
    setError(false);
    const params = { cabin_class: cabinClass, days_ahead: 60 };
    if (origin)      params.origin = origin;
    if (destination) params.destination = destination;

    api.get(`/prices/cheapest-dates/${routeId}`, { params })
      .then((r) => setData(r.data))
      .catch(() => { setError(true); setData({ dates: [] }); })
      .finally(() => setLoading(false));
  }, [routeId, cabinClass, origin, destination]);

  // Build date map for O(1) lookup
  const dateMap = new Map((data?.dates ?? []).map((d) => [d.date, d]));

  // Render a 60-day strip starting today
  const today = startOfDay(new Date());
  const days  = Array.from({ length: 60 }, (_, i) => addDays(today, i));

  if (loading) {
    return (
      <div className="card p-3">
        <div className="h-16 flex items-center justify-center text-xs text-zinc-400 animate-pulse">
          Loading cheapest dates…
        </div>
      </div>
    );
  }

  if (error || !data || data.dates.length === 0) {
    return (
      <div className="card p-3">
        <div className="h-16 flex flex-col items-center justify-center text-center">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Cheapest-date calendar populates after a few scans.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-3">
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
          Cheapest dates · next 60 days
        </p>
        <div className="flex items-center gap-3 text-2xs text-zinc-500 dark:text-zinc-400">
          <span className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${LEVEL_DOT.cheap}`} /> Cheap</span>
          <span className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${LEVEL_DOT.normal}`} /> Normal</span>
          <span className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${LEVEL_DOT.expensive}`} /> Pricey</span>
        </div>
      </div>

      <div className="overflow-x-auto -mx-1 px-1 pb-1">
        <div className="flex gap-1 min-w-max">
          {days.map((day) => {
            const key   = format(day, "yyyy-MM-dd");
            const entry = dateMap.get(key);
            const level = entry?.level ?? null;
            const cls   = level ? LEVEL_COLOR[level] : "bg-zinc-50 dark:bg-zinc-900 text-zinc-300 dark:text-zinc-700";
            return (
              <button
                key={key}
                onClick={() => entry && onSelectDate?.(key, entry)}
                disabled={!entry}
                className={`flex-shrink-0 w-12 rounded-lg flex flex-col items-center justify-center py-1.5 transition-all
                            ${cls} ${entry ? "cursor-pointer" : "cursor-default opacity-60"}`}
                title={entry ? `${format(day, "EEE d MMM")} — $${Math.round(entry.price).toLocaleString()}` : format(day, "EEE d MMM")}
              >
                <span className="text-2xs font-medium uppercase tracking-wide">
                  {format(day, "EEE")}
                </span>
                <span className="text-sm font-bold tabular-nums">
                  {format(day, "d")}
                </span>
                {entry && (
                  <span className="text-2xs font-semibold tabular-nums mt-0.5">
                    ${Math.round(entry.price / 1000)}k
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
