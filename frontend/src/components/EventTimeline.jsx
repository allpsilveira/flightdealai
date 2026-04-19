import { useEffect, useState, useCallback } from "react";
import api from "../lib/api";
import TimelineEvent from "./TimelineEvent";

const FILTERS = [
  { key: "all",      label: "All" },
  { key: "critical", label: "Critical" },
  { key: "high",     label: "High" },
  { key: "medium",   label: "Medium" },
];

/**
 * Zillow-style activity feed sourced from /api/events/route/{id}.
 * Each event renders via the existing TimelineEvent component.
 */
export default function EventTimeline({ routeId, refreshKey = 0, onEventClick }) {
  const [events, setEvents] = useState(null);
  const [filter, setFilter] = useState("all");
  const [error,  setError]  = useState(false);

  const reload = useCallback(() => {
    if (!routeId) return;
    setEvents(null);
    setError(false);
    api.get(`/events/route/${routeId}`, { params: { limit: 100 } })
      .then((r) => setEvents(r.data))
      .catch(() => { setEvents([]); setError(true); });
  }, [routeId]);

  useEffect(() => { reload(); }, [reload, refreshKey]);

  const visible = (events ?? []).filter((e) => filter === "all" ? true : e.severity === filter);

  return (
    <div>
      <div className="flex items-center gap-1 mb-4 flex-wrap">
        {FILTERS.map(({ key, label }) => {
          const count = key === "all"
            ? (events ?? []).length
            : (events ?? []).filter((e) => e.severity === key).length;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1.5
                ${filter === key
                  ? "bg-brand-500 text-white"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                }`}
            >
              {label}
              {events !== null && count > 0 && (
                <span className={`text-2xs tabular-nums ${filter === key ? "opacity-80" : "opacity-60"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
        <button
          onClick={reload}
          className="ml-auto text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          title="Refresh events"
        >
          ↺ Refresh
        </button>
      </div>

      {events === null && (
        <div className="space-y-5 animate-pulse px-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-zinc-100 dark:bg-zinc-800 mt-1.5" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded w-1/3" />
                <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {events !== null && visible.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white mb-1">
            {events.length === 0 ? "No events yet" : "No events match this filter"}
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            {events.length === 0
              ? "Events will appear after the first few scans (price drops, new lows, errors, etc)."
              : <button onClick={() => setFilter("all")} className="text-brand-500 hover:underline">Show all</button>}
          </p>
        </div>
      )}

      {events !== null && visible.length > 0 && (
        <div className="relative">
          {visible.map((ev, i) => (
            <TimelineEvent
              key={ev.id ?? i}
              event={ev}
              onClick={onEventClick}
              isLast={i === visible.length - 1}
            />
          ))}
        </div>
      )}

      {error && (
        <p className="text-2xs text-red-500 mt-2">Failed to load events.</p>
      )}
    </div>
  );
}
