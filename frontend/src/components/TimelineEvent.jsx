import { formatDistanceToNow } from "date-fns";

const SEVERITY_DOT = {
  critical: "bg-red-500",
  high:     "bg-emerald-500",
  medium:   "bg-amber-400",
  low:      "bg-blue-400",
  info:     "bg-zinc-400 dark:bg-zinc-600",
};

const SEVERITY_LABEL = {
  critical: "text-red-600 dark:text-red-400",
  high:     "text-emerald-600 dark:text-emerald-400",
  medium:   "text-amber-600 dark:text-amber-400",
  low:      "text-blue-600 dark:text-blue-400",
  info:     "text-zinc-500 dark:text-zinc-400",
};

const EVENT_TYPE_LABEL = {
  price_drop:       "Price Drop",
  price_rise:       "Price Rise",
  error_fare:       "Error Fare",
  award_opened:     "Award Available",
  award_closed:     "Award Closed",
  airport_arbitrage:"Airport Savings",
  trend_reversal:   "Trend Reversal",
  new_low:          "New Low",
  stable:           "Stable",
  monitoring_started:"Monitoring Started",
  fare_brand_detected:"Fare Brand",
  scarcity_alert:   "Scarcity Alert",
  ai_insight:       "AI Insight",
};

export default function TimelineEvent({ event, onClick, isLast }) {
  const dotCls = SEVERITY_DOT[event.severity] ?? SEVERITY_DOT.info;
  const labelCls = SEVERITY_LABEL[event.severity] ?? SEVERITY_LABEL.info;

  return (
    <div
      className="flex gap-3 cursor-pointer group"
      onClick={() => onClick?.(event)}
    >
      {/* Timeline line + dot */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${dotCls}
                        group-hover:scale-125 transition-transform`} />
        {!isLast && (
          <div className="w-px flex-1 bg-zinc-200 dark:bg-zinc-700 mt-1.5" />
        )}
      </div>

      {/* Content */}
      <div className={`pb-4 min-w-0 flex-1 ${isLast ? "" : ""}`}>
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className={`text-2xs font-semibold uppercase tracking-wide ${labelCls}`}>
            {EVENT_TYPE_LABEL[event.event_type] ?? event.event_type}
          </span>
          <span className="text-2xs text-zinc-400 dark:text-zinc-500">
            {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
          </span>
        </div>
        <p className="text-sm font-medium text-zinc-900 dark:text-white leading-snug">
          {event.headline}
        </p>
        {event.detail && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
            {event.detail}
          </p>
        )}
        {event.subtext && (
          <p className="text-2xs text-zinc-400 dark:text-zinc-500 mt-0.5">{event.subtext}</p>
        )}
      </div>
    </div>
  );
}
