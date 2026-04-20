/**
 * ScoreExplainer — plain-English breakdown of why a deal scored what it did.
 *
 * Top-level: verdict tag + headline + 1-2 sentence summary.
 * Drivers: top 3-5 sub-scores with a horizontal weight bar and plain-English text.
 * "Show technical view" toggle reveals the raw 0-30/0-20/etc. point breakdown.
 *
 * Props:
 *   dealId — the DealAnalysis UUID. We fetch /api/deals/{dealId}/explain ourselves.
 *   compact — render a smaller variant (no headline, no summary, just verdict + drivers)
 */
import { useEffect, useState } from "react";
import api from "../lib/api";
import FormattedText from "./FormattedText";

const TONE_BG = {
  emerald:   "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
  champagne: "bg-champagne/15 text-champagne border border-champagne/30",
  amber:     "bg-amber-500/15 text-amber-300 border border-amber-500/30",
  zinc:      "bg-zinc-800/60 text-zinc-400 border border-zinc-700",
};

const BAR_FILL = {
  emerald:   "bg-emerald-500",
  champagne: "bg-champagne",
  amber:     "bg-amber-500",
  zinc:      "bg-zinc-600",
};

const CONFIDENCE_LABEL = {
  high:   { label: "High confidence", tone: "emerald" },
  medium: { label: "Medium confidence", tone: "champagne" },
  low:    { label: "Low confidence — early data", tone: "amber" },
};

export default function ScoreExplainer({ dealId, compact = false }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [showTech, setShowTech] = useState(false);

  useEffect(() => {
    if (!dealId) return;
    let cancelled = false;
    setLoading(true);
    api.get(`/deals/${dealId}/explain`)
      .then((r) => { if (!cancelled) { setData(r.data); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e.response?.data?.detail ?? "Failed to load explanation"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dealId]);

  if (loading) {
    return <div className="rounded-lg bg-zinc-900/40 border border-zinc-800 p-4 h-32 animate-pulse" />;
  }
  if (error || !data) {
    return (
      <div className="rounded-lg bg-zinc-900/40 border border-zinc-800 p-4">
        <p className="text-xs text-zinc-500">Score explanation unavailable.</p>
      </div>
    );
  }

  const drivers     = data.drivers ?? [];
  const topDrivers  = drivers.filter((d) => d.plain).slice(0, compact ? 3 : 5);
  const conf        = CONFIDENCE_LABEL[data.confidence] ?? CONFIDENCE_LABEL.low;

  return (
    <div className="rounded-lg bg-zinc-900/40 border border-zinc-800 overflow-hidden">

      {/* ── Header: verdict tag + score ─────────────────────────── */}
      <div className="px-5 py-4 border-b border-zinc-800 bg-zinc-950/40">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`px-2.5 py-1 rounded-full text-2xs font-semibold tracking-wider uppercase ${TONE_BG[data.verdict_tone] ?? TONE_BG.zinc}`}>
                {data.verdict}
              </span>
              {data.is_error_fare && (
                <span className="px-2.5 py-1 rounded-full text-2xs font-semibold tracking-wider uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Error fare
                </span>
              )}
              {data.is_gem && !data.is_error_fare && (
                <span className="px-2.5 py-1 rounded-full text-2xs font-semibold tracking-wider uppercase bg-champagne/15 text-champagne border border-champagne/30">
                  Gem
                </span>
              )}
            </div>
            {!compact && (
              <p className="text-base font-serif text-zinc-100 leading-snug">
                {data.headline}
              </p>
            )}
          </div>

          <div className="text-right flex-shrink-0">
            <p className="font-serif text-3xl text-champagne tabular-nums leading-none">
              {data.normalized.toFixed(1)}
            </p>
            <p className="text-2xs text-zinc-500 mt-1">/ 10</p>
          </div>
        </div>

        {!compact && data.summary && (
          <p className="text-xs text-zinc-400 leading-relaxed mt-3 font-light">
            <FormattedText text={data.summary} />
          </p>
        )}
      </div>

      {/* ── Drivers ──────────────────────────────────────────────── */}
      <div className="px-5 py-4 space-y-3">
        <div className="flex items-baseline justify-between mb-1">
          <p className="text-2xs font-semibold text-zinc-500 uppercase tracking-[0.15em]">
            Why this score
          </p>
          <span className={`text-2xs ${conf.tone === "emerald" ? "text-emerald-400" : conf.tone === "champagne" ? "text-champagne" : "text-amber-400"}`}>
            {conf.label}
          </span>
        </div>

        {topDrivers.length === 0 ? (
          <p className="text-xs text-zinc-500 italic">
            Not enough history yet — most signals strengthen after 30+ days of price data.
          </p>
        ) : (
          topDrivers.map((d) => (
            <div key={d.label} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-zinc-300">{d.label}</span>
                <span className="text-2xs text-zinc-600 tabular-nums">
                  {d.raw}/{d.max}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-zinc-800/80 overflow-hidden">
                <div
                  className={`h-full ${BAR_FILL[d.tone] ?? BAR_FILL.zinc} transition-[width] duration-500`}
                  style={{ width: `${Math.min(100, d.weight * 100)}%` }}
                />
              </div>
              {d.plain && (
                <p className="text-xs text-zinc-400 leading-relaxed font-light">
                  <FormattedText text={d.plain} />
                </p>
              )}
            </div>
          ))
        )}
      </div>

      {/* ── Technical toggle ─────────────────────────────────────── */}
      <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-950/40">
        <button
          onClick={() => setShowTech((v) => !v)}
          className="text-2xs text-zinc-500 hover:text-champagne transition-colors flex items-center gap-1.5"
        >
          <span>{showTech ? "▼" : "▶"}</span>
          <span className="uppercase tracking-wider font-semibold">Technical view</span>
        </button>

        {showTech && (
          <div className="mt-3 space-y-2 font-mono text-2xs">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-zinc-400">
              {drivers.map((d) => (
                <div key={d.label} className="flex justify-between border-b border-zinc-800/50 py-1">
                  <span className="text-zinc-500">{d.label}</span>
                  <span className="tabular-nums text-zinc-300">
                    {d.raw}<span className="text-zinc-600">/{d.max}</span>
                  </span>
                </div>
              ))}
              <div className="flex justify-between pt-2 col-span-2 border-t border-zinc-700">
                <span className="text-zinc-500">Raw total</span>
                <span className="tabular-nums text-champagne font-semibold">
                  {data.raw_total}<span className="text-zinc-600">/170</span>
                </span>
              </div>
              <div className="flex justify-between col-span-2">
                <span className="text-zinc-500">Action</span>
                <span className="tabular-nums text-zinc-300">{data.action}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
