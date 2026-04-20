import { useEffect, useState, useCallback } from "react";
import api from "../lib/api";
import TimelineEvent from "./TimelineEvent";

const FILTERS = [
  { key: "all",      label: "All" },
  { key: "critical", label: "Critical" },
  { key: "high",     label: "Notable" },
  { key: "medium",   label: "Routine" },
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
      {/* Filter pills */}
      <div className="flex items-center gap-1.5 mb-5 flex-wrap">
        {FILTERS.map(({ key, label }) => {
          const count = key === "all"
            ? (events ?? []).length
            : (events ?? []).filter((e) => e.severity === key).length;
          const isActive = filter === key;
          const isCritical = key === "critical";

          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5
                ${isActive
                  ? isCritical
                    ? "bg-red-500/15 text-red-300 border border-red-500/30"
                    : "bg-champagne/15 text-champagne border border-champagne/30"
                  : "border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
                }`}
            >
              {label}
              {events !== null && count > 0 && (
                <span className={`text-2xs tabular-nums ${isActive ? "opacity-80" : "opacity-60"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
        <button
          onClick={reload}
          className="ml-auto text-xs text-zinc-500 hover:text-champagne transition-colors"
          title="Refresh events"
        >
          ↺ Refresh
        </button>
      </div>

      {/* Loading skeleton */}
      {events === null && (
        <div className="space-y-5 animate-pulse px-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-zinc-800 mt-1.5" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-3 bg-zinc-800 rounded w-1/3" />
                <div className="h-4 bg-zinc-800 rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {events !== null && visible.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-9 h-9 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3">
            <span className="text-zinc-600 text-base">∅</span>
          </div>
          <p className="text-sm font-medium text-zinc-200 mb-1">
            {events.length === 0 ? "No events yet" : "No events for this filter"}
          </p>
          <p className="text-xs text-zinc-500">
            {events.length === 0
              ? "Events appear after the first few scans (price drops, new lows, errors, etc)."
              : <button onClick={() => setFilter("all")} className="text-champagne hover:text-champagne/80">Show all events</button>}
          </p>
        </div>
      )}

      {/* Timeline */}
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
        <p className="text-2xs text-red-400 mt-2">Failed to load events.</p>
      )}
    </div>
  );
}
