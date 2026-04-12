import { useEffect } from "react";
import { useEventsStore } from "../stores/useEvents";
import TimelineEvent from "./TimelineEvent";

export default function ActivityTimeline({ routeId, onEventClick }) {
  const events  = useEventsStore((s) => s.events[routeId] ?? null);
  const loading = useEventsStore((s) => s.loading[routeId] ?? false);
  const fetchEvents = useEventsStore((s) => s.fetchEvents);

  useEffect(() => {
    if (routeId) fetchEvents(routeId);
  }, [routeId]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-200 dark:bg-zinc-700 mt-1 flex-shrink-0" />
            <div className="flex-1 space-y-1.5 pb-4">
              <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded w-1/4" />
              <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded w-3/4" />
              <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-3">
          <svg className="w-4 h-4 text-zinc-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="6"/>
            <path d="M8 5v3.5l2 1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <p className="text-sm font-medium text-zinc-900 dark:text-white mb-1">No events yet</p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Price changes, award openings, and alerts will appear here as scans run.
        </p>
      </div>
    );
  }

  return (
    <div>
      {events.map((event, i) => (
        <TimelineEvent
          key={event.id}
          event={event}
          onClick={onEventClick}
          isLast={i === events.length - 1}
        />
      ))}
    </div>
  );
}
