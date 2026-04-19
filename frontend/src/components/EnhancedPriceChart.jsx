import { useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, ReferenceDot, Legend,
} from "recharts";
import { format, parseISO } from "date-fns";
import { SEVERITY_COLORS } from "../lib/colors";

const RANGE_OPTIONS = [7, 30, 60, 90, 180, "ALL"];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const dateLabel = (() => { try { return format(parseISO(label), "d MMM yyyy"); } catch { return label; } })();
  return (
    <div className="card px-3 py-2 text-xs font-sans shadow-lg">
      <p className="text-zinc-500 dark:text-zinc-400 mb-1.5 font-medium">{dateLabel}</p>
      {payload
        .filter((p) => p.value != null && !p.dataKey?.startsWith("_"))
        .map((p) => (
          <p key={p.name} className="font-medium tabular-nums" style={{ color: p.color }}>
            {p.name}: ${Math.round(p.value).toLocaleString()}
          </p>
        ))}
    </div>
  );
};

/**
 * SteamDB-inspired chart:
 *  - p10–p90 percentile band
 *  - average + min lines
 *  - persistent historical-low dashed line (all-time min)
 *  - current-price reference
 *  - forecast extension (optional)
 *  - event annotations (vertical dashed lines)
 *  - range toggle: 7/30/60/90/180/ALL
 */
export default function EnhancedPriceChart({
  history = [],
  events = [],
  forecast = null,
  currentPrice = null,
  defaultRangeDays = 30,
  onRangeChange,
}) {
  const [range, setRange] = useState(defaultRangeDays);

  // Filter history by range
  const filteredHistory = useMemo(() => {
    if (range === "ALL" || !history.length) return history;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - range);
    return history.filter((h) => {
      try { return parseISO(h.bucket) >= cutoff; } catch { return true; }
    });
  }, [history, range]);

  // All-time min (persistent dashed line — SteamDB style)
  const allTimeMin = useMemo(() => {
    if (!history.length) return null;
    return Math.min(...history.map((h) => h.min_price).filter((v) => v != null));
  }, [history]);

  // Combine history + forecast tail into one dataset
  const data = useMemo(() => {
    const base = filteredHistory.map((h) => ({ ...h, _isHistory: true }));
    if (forecast?.points?.length) {
      forecast.points.forEach((p) => {
        base.push({
          bucket: p.date,
          forecast: p.predicted_price,
          forecast_low: p.confidence_low,
          forecast_high: p.confidence_high,
          _isForecast: true,
        });
      });
    }
    return base;
  }, [filteredHistory, forecast]);

  // Map events to chart annotations
  const eventAnnotations = useMemo(() => {
    if (!events.length || !data.length) return [];
    const dataDates = new Set(data.map((d) => d.bucket?.slice(0, 10)));
    return events
      .filter((e) => e.timestamp)
      .map((e) => ({ ...e, _date: e.timestamp.slice(0, 10) }))
      .filter((e) => dataDates.has(e._date))
      .slice(0, 25);  // cap visual clutter
  }, [events, data]);

  const handleRange = (r) => {
    setRange(r);
    if (onRangeChange) onRangeChange(r === "ALL" ? 365 : r);
  };

  if (!history.length) {
    return (
      <div className="h-56 flex flex-col items-center justify-center text-center">
        <p className="text-sm font-medium text-zinc-900 dark:text-white mb-1">No price history yet</p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">Run a scan to start collecting data.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3 text-2xs text-zinc-500 dark:text-zinc-400 flex-wrap">
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#f26419]" /> Avg</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#10b981]" /> Min</span>
          {allTimeMin && (
            <span className="flex items-center gap-1">
              <span className="w-3 h-px border-t border-dashed border-emerald-500" /> All-time low ${Math.round(allTimeMin).toLocaleString()}
            </span>
          )}
          {forecast && (
            <span className="flex items-center gap-1">
              <span className="w-3 h-px border-t border-dashed border-purple-400" /> Forecast
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {RANGE_OPTIONS.map((r) => (
            <button
              key={r}
              onClick={() => handleRange(r)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                range === r
                  ? "bg-brand-500 text-white border-brand-500"
                  : "bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700"
              }`}
            >
              {r === "ALL" ? "All" : `${r}d`}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="ehBand" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#f26419" stopOpacity={0.12}/>
              <stop offset="95%" stopColor="#f26419" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="ehForecast" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#a855f7" stopOpacity={0.18}/>
              <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.06}/>

          <XAxis
            dataKey="bucket"
            tickFormatter={(v) => { try { return format(parseISO(v), "d MMM"); } catch { return v; } }}
            tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
          />
          <YAxis
            tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
            tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={50}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* p10–p90 band */}
          <Area type="monotone" dataKey="p90" name="P90" stroke="transparent" fill="url(#ehBand)" legendType="none"/>
          <Area type="monotone" dataKey="p10" name="P10" stroke="transparent" fill="white" fillOpacity={0} legendType="none"/>

          {/* Forecast confidence band */}
          {forecast && (
            <Area type="monotone" dataKey="forecast_high" name="ForecastHigh" stroke="transparent" fill="url(#ehForecast)" legendType="none"/>
          )}
          {forecast && (
            <Area type="monotone" dataKey="forecast_low"  name="ForecastLow"  stroke="transparent" fill="white" fillOpacity={0} legendType="none"/>
          )}

          {/* Average line */}
          <Line type="monotone" dataKey="avg_price" name="Avg" stroke="#f26419" strokeWidth={2} dot={false}/>

          {/* Min line */}
          <Line type="monotone" dataKey="min_price" name="Min" stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 2" dot={false}/>

          {/* Forecast line */}
          {forecast && (
            <Line type="monotone" dataKey="forecast" name="Forecast" stroke="#a855f7" strokeWidth={2} strokeDasharray="3 3" dot={false}/>
          )}

          {/* All-time low (persistent dashed) */}
          {allTimeMin != null && (
            <ReferenceLine y={allTimeMin} stroke="#10b981" strokeDasharray="2 4" strokeOpacity={0.5}
              label={{ value: `Low $${Math.round(allTimeMin / 1000)}k`, fill: "#10b981", fontSize: 9, position: "insideBottomLeft" }}/>
          )}

          {/* Current price */}
          {currentPrice != null && (
            <ReferenceLine y={currentPrice} stroke="#f5c842" strokeDasharray="4 4"
              label={{ value: `Now $${Math.round(currentPrice / 1000)}k`, fill: "#f5c842", fontSize: 10 }}/>
          )}

          {/* Event annotations (vertical lines) */}
          {eventAnnotations.map((e) => {
            const cfg = SEVERITY_COLORS[e.severity] ?? SEVERITY_COLORS.info;
            return (
              <ReferenceLine
                key={e.id ?? `${e._date}-${e.event_type}`}
                x={e._date}
                stroke={cfg.hex}
                strokeOpacity={0.45}
                strokeDasharray="2 3"
              />
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
