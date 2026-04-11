import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 text-xs font-sans">
      <p className="text-white/50 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: ${p.value?.toFixed(0)}
        </p>
      ))}
    </div>
  );
};

export default function PriceChart({ data = [], currentPrice }) {
  if (!data.length) {
    return (
      <div className="h-48 flex items-center justify-center text-white/20 text-sm font-sans">
        No price history yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradRange" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#d4a843" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#d4a843" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gradAvg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />

        <XAxis
          dataKey="bucket"
          tickFormatter={(v) => format(parseISO(v), "MMM d")}
          tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => `$${v.toLocaleString()}`}
          tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={70}
        />

        <Tooltip content={<CustomTooltip />} />

        {/* p10–p90 shaded band */}
        <Area
          type="monotone"
          dataKey="p10"
          stroke="transparent"
          fill="url(#gradRange)"
          name="p10"
        />
        <Area
          type="monotone"
          dataKey="p90"
          stroke="transparent"
          fill="transparent"
          name="p90"
        />

        {/* Average price line */}
        <Area
          type="monotone"
          dataKey="avg_price"
          stroke="#6366f1"
          strokeWidth={1.5}
          fill="url(#gradAvg)"
          dot={false}
          name="Average"
        />

        {/* Min price line */}
        <Area
          type="monotone"
          dataKey="min_price"
          stroke="#d4a843"
          strokeWidth={2}
          fill="transparent"
          dot={false}
          name="Best Price"
        />

        {/* Current price reference line */}
        {currentPrice && (
          <ReferenceLine
            y={currentPrice}
            stroke="#f5c842"
            strokeDasharray="4 4"
            label={{ value: `Now $${currentPrice}`, fill: "#f5c842", fontSize: 11 }}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
