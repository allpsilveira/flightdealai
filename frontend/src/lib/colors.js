/**
 * Unified color system — single source of truth across all components.
 * Using Tailwind class strings for components and hex for charts/inline styles.
 */

// Action / deal recommendation colors
export const ACTION_COLORS = {
  STRONG_BUY: { bg: 'bg-red-500', text: 'text-red-500', border: 'border-red-500', hex: '#ef4444', label: 'STRONG BUY' },
  BUY:         { bg: 'bg-emerald-500', text: 'text-emerald-500', border: 'border-emerald-500', hex: '#10b981', label: 'BUY' },
  WATCH:       { bg: 'bg-amber-500', text: 'text-amber-500', border: 'border-amber-500', hex: '#f59e0b', label: 'WATCH' },
  NORMAL:      { bg: 'bg-zinc-400', text: 'text-zinc-400', border: 'border-zinc-400', hex: '#a1a1aa', label: 'NORMAL' },
  SKIP:        { bg: 'bg-zinc-600', text: 'text-zinc-500', border: 'border-zinc-600', hex: '#71717a', label: 'SKIP' },
};

// GEM (special anomaly fares)
export const GEM_COLORS = {
  primary: '#d4a843',
  light: '#f5d78e',
  bg: 'bg-amber-400',
  text: 'text-amber-300',
  gradient: 'linear-gradient(135deg, #d4a843, #f5d78e)',
};

// Event severity (timeline dots, alerts)
export const SEVERITY_COLORS = {
  critical: { dot: 'bg-red-500',     ring: 'ring-red-500/40',     text: 'text-red-500',     hex: '#ef4444' },
  high:     { dot: 'bg-emerald-500', ring: 'ring-emerald-500/40', text: 'text-emerald-500', hex: '#10b981' },
  medium:   { dot: 'bg-amber-500',   ring: 'ring-amber-500/40',   text: 'text-amber-500',   hex: '#f59e0b' },
  low:      { dot: 'bg-blue-400',    ring: 'ring-blue-400/40',    text: 'text-blue-400',    hex: '#60a5fa' },
  info:     { dot: 'bg-zinc-500',    ring: 'ring-zinc-500/40',    text: 'text-zinc-500',    hex: '#71717a' },
};

// Trend direction (price arrows)
export const TREND_COLORS = {
  low:      { text: 'text-emerald-500', hex: '#10b981', arrow: '↓↓', label: 'Falling fast' },
  dropping: { text: 'text-emerald-500', hex: '#10b981', arrow: '↓',  label: 'Dropping' },
  stable:   { text: 'text-zinc-400',    hex: '#a1a1aa', arrow: '→',  label: 'Stable' },
  rising:   { text: 'text-amber-500',   hex: '#f59e0b', arrow: '↑',  label: 'Rising' },
  spiking:  { text: 'text-red-500',     hex: '#ef4444', arrow: '↑↑', label: 'Spiking' },
};

// Cabin class colors (for chips, multi-line charts)
export const CABIN_COLORS = {
  business:        { bg: 'bg-indigo-500', text: 'text-indigo-300', border: 'border-indigo-500/30', hex: '#6366f1', label: 'Business' },
  first:           { bg: 'bg-amber-500',  text: 'text-amber-300',  border: 'border-amber-500/30',  hex: '#d4a843', label: 'First' },
  premium_economy: { bg: 'bg-teal-500',   text: 'text-teal-300',   border: 'border-teal-500/30',   hex: '#14b8a6', label: 'Premium Eco' },
};

// Data source colors (badges showing which APIs confirmed)
export const SOURCE_COLORS = {
  google:     { bg: 'bg-blue-500/15',   text: 'text-blue-400',   border: 'border-blue-500/30',   hex: '#3b82f6', label: 'Google Flights' },
  duffel:     { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30', hex: '#a855f7', label: 'Duffel' },
  seats_aero: { bg: 'bg-amber-500/15',  text: 'text-amber-400',  border: 'border-amber-500/30',  hex: '#d4a843', label: 'Seats.aero' },
  anthropic:  { bg: 'bg-zinc-500/15',   text: 'text-zinc-400',   border: 'border-zinc-500/30',   hex: '#71717a', label: 'Claude AI' },
};

// Score range colors (continuous scale 0-10)
export const SCORE_COLORS = {
  excellent: { range: [8, 10],   text: 'text-red-500',     hex: '#ef4444', label: 'Excellent' },
  strong:    { range: [6, 8],    text: 'text-emerald-500', hex: '#10b981', label: 'Strong' },
  moderate:  { range: [4, 6],    text: 'text-amber-500',   hex: '#f59e0b', label: 'Moderate' },
  normal:    { range: [2.5, 4],  text: 'text-zinc-400',    hex: '#a1a1aa', label: 'Normal' },
  skip:      { range: [0, 2.5],  text: 'text-zinc-600',    hex: '#71717a', label: 'Skip' },
};

// Price regime backgrounds (chart band overlays)
export const REGIME_COLORS = {
  sale:   { fill: '#10b98115', stroke: '#10b98140', label: 'Sale' },
  normal: { fill: 'transparent', stroke: 'transparent', label: 'Normal' },
  peak:   { fill: '#ef444415', stroke: '#ef444440', label: 'Peak' },
  error:  { fill: '#d4a84320', stroke: '#d4a84360', label: 'Error fare zone' },
};

// Buy/Wait verdict colors (Phase 8)
export const VERDICT_COLORS = {
  BUY_NOW:  { bg: 'bg-emerald-500',     text: 'text-white',          hex: '#10b981', label: 'BUY NOW' },
  URGENT:   { bg: 'bg-red-500',         text: 'text-white',          hex: '#ef4444', label: 'URGENT' },
  WAIT:     { bg: 'bg-blue-500',        text: 'text-white',          hex: '#3b82f6', label: 'WAIT' },
  MONITOR:  { bg: 'bg-zinc-500',        text: 'text-white',          hex: '#71717a', label: 'MONITOR' },
};

/** Resolve action color from action string. */
export function actionColor(action) {
  return ACTION_COLORS[action] || ACTION_COLORS.NORMAL;
}

/** Resolve severity color from severity string. */
export function severityColor(severity) {
  return SEVERITY_COLORS[severity] || SEVERITY_COLORS.info;
}

/** Resolve trend color from trend label string. */
export function trendColor(trend) {
  return TREND_COLORS[trend] || TREND_COLORS.stable;
}

/** Resolve cabin color (handles "BUSINESS"/"business"/"premium_economy" variants). */
export function cabinColor(cabin) {
  if (!cabin) return CABIN_COLORS.business;
  const key = cabin.toLowerCase().replace(/[\s-]/g, '_');
  return CABIN_COLORS[key] || CABIN_COLORS.business;
}

/** Resolve source color from source string. */
export function sourceColor(source) {
  if (!source) return SOURCE_COLORS.google;
  const key = source.toLowerCase().replace(/[\s.-]/g, '_').replace('seats_aero', 'seats_aero');
  return SOURCE_COLORS[key] || SOURCE_COLORS.google;
}

/** Resolve score band from numeric score. */
export function scoreColor(score) {
  if (score >= 8) return SCORE_COLORS.excellent;
  if (score >= 6) return SCORE_COLORS.strong;
  if (score >= 4) return SCORE_COLORS.moderate;
  if (score >= 2.5) return SCORE_COLORS.normal;
  return SCORE_COLORS.skip;
}
