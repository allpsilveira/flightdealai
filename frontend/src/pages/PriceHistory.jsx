import { useState, useEffect } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, Legend,
} from "recharts";
import { format, parseISO } from "date-fns";
import api from "../lib/api";

const CABIN_LABEL = { BUSINESS: "Business", FIRST: "First Class", PREMIUM_ECONOMY: "Premium Economy" };

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-4 py-3 text-xs space-y-1 min-w-[160px]">
      <p className="font-semibold text-zinc-900 dark:text-white mb-2">
        {label ? format(parseISO(label), "d MMM yyyy") : ""}
      </p>
      {payload.map(p => (
        <div key={p.name} className="flex justify-between gap-4">
          <span className="text-zinc-500 dark:text-zinc-400">{p.name}</span>
          <span className="font-medium text-zinc-900 dark:text-white">${p.value?.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

export default function PriceHistory() {
  const [routes,   setRoutes]   = useState([]);
  const [selected, setSelected] = useState(null);
  const [cabin,    setCabin]    = useState("BUSINESS");
  const [origin,   setOrigin]   = useState("");
  const [dest,     setDest]     = useState("");
  const [days,     setDays]     = useState(90);
  const [data,     setData]     = useState([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    api.get("/routes/").then(r => {
      setRoutes(r.data);
      if (r.data.length > 0) {
        const first = r.data[0];
        setSelected(first.id);
        setOrigin(first.origins[0] ?? "");
        setDest(first.destinations[0] ?? "");
        setCabin(first.cabin_classes[0] ?? "BUSINESS");
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selected || !origin || !dest || !cabin) return;
    setLoading(true);
    api.get(`/prices/history/${selected}`, {
      params: { origin, destination: dest, cabin_class: cabin, days },
    }).then(r => setData(r.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [selected, origin, dest, cabin, days]);

  const route = routes.find(r => r.id === selected);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white tracking-tight">
          Price History
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          90-day price curves with statistical bands
        </p>
      </div>

      <div className="flex flex-wrap gap-3 mb-6 p-4 card">
        <div className="flex items-center gap-2">
          <span className="label">Route</span>
          <select className="input py-1.5 text-sm" value={selected ?? ""} onChange={e => {
            const r = routes.find(x => x.id === e.target.value);
            setSelected(e.target.value);
            if (r) { setOrigin(r.origins[0] ?? ""); setDest(r.destinations[0] ?? ""); setCabin(r.cabin_classes[0] ?? "BUSINESS"); }
          }}>
            {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>

        {route && (
          <>
            <div className="flex items-center gap-2">
              <span className="label">From</span>
              <select className="input py-1.5 text-sm" value={origin} onChange={e => setOrigin(e.target.value)}>
                {route.origins.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="label">To</span>
              <select className="input py-1.5 text-sm" value={dest} onChange={e => setDest(e.target.value)}>
                {route.destinations.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="label">Cabin</span>
              <select className="input py-1.5 text-sm" value={cabin} onChange={e => setCabin(e.target.value)}>
                {route.cabin_classes.map(c => <option key={c} value={c}>{CABIN_LABEL[c]}</option>)}
              </select>
            </div>
          </>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <span className="label">Period</span>
          {[30, 60, 90].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                days === d
                  ? "bg-brand-500 text-white border-brand-500"
                  : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700"
              }`}
            >{d}d</button>
          ))}
        </div>
      </div>

      <div className="card p-6">
        {loading ? (
          <div className="h-80 flex items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
            Loading price data…
          </div>
        ) : data.length === 0 ? (
          <div className="h-80 flex flex-col items-center justify-center">
            <p className="text-base font-medium text-zinc-900 dark:text-white mb-1">No data yet</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Price history will appear once scanning starts.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-4 mb-6">
              {[
                { label: "Current",  value: data[data.length - 1]?.avg_price },
                { label: "90d Low",  value: Math.min(...data.map(d => d.min_price)) },
                { label: "90d High", value: Math.max(...data.map(d => d.max_price)) },
                { label: "Median",   value: data[data.length - 1]?.p50 },
              ].map(({ label, value }) => (
                <div key={label} className="text-center p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800">
                  <p className="label mb-1">{label}</p>
                  <p className="text-lg font-semibold text-zinc-900 dark:text-white tabular-nums">
                    {value ? `$${Math.round(value).toLocaleString()}` : "—"}
                  </p>
                </div>
              ))}
            </div>

            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="bandGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#f26419" stopOpacity={0.12}/>
                    <stop offset="95%" stopColor="#f26419" stopOpacity={0.01}/>
                  </linearGradient>
                  <linearGradient id="avgGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#f26419" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#f26419" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.06}/>
                <XAxis
                  dataKey="bucket"
                  tickFormatter={v => { try { return format(parseISO(v), "d MMM"); } catch { return v; } }}
                  tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
                />
                <YAxis
                  tickFormatter={v => `$${(v/1000).toFixed(0)}k`}
                  tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={50}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />

                <Area type="monotone" dataKey="p90" name="P90" stroke="transparent"
                  fill="url(#bandGrad)" fillOpacity={1} legendType="none"/>
                <Area type="monotone" dataKey="p10" name="P10" stroke="transparent"
                  fill="white" fillOpacity={1} legendType="none"/>

                <Area type="monotone" dataKey="avg_price" name="Avg Price"
                  stroke="#f26419" strokeWidth={2} fill="url(#avgGrad)"
                  dot={false} activeDot={{ r: 4, fill: "#f26419" }}/>

                <Area type="monotone" dataKey="min_price" name="Min Price"
                  stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 2"
                  fill="transparent" dot={false}/>
              </AreaChart>
            </ResponsiveContainer>

            <p className="text-2xs text-zinc-500 dark:text-zinc-400 text-center mt-3">
              Shaded band = P10–P90 range · Dashed green = lowest observed price
            </p>
          </>
        )}
      </div>
    </div>
  );
}