/**
 * Cost-per-scan estimate (Phase 8.17).
 * Pure client-side calculator — no API call. Mirrors the cost model
 * documented in CLAUDE.md so users see what each route will cost to monitor.
 *
 * Cost model:
 *   SerpApi:    $0.025/call. Quick scan every 4h (×6/day) + deep scan ×3/day.
 *               Per (origin, destination, cabin, date) combo per day = 9 calls.
 *   Duffel:     $0.005/call. Once daily at 7 AM + on-demand.
 *               Per combo per day = 1 call.
 *   Seats.aero: Flat $10/mo subscription. No per-call cost.
 *   Anthropic:  Token-based. Avg ~$0.005 per AI recommendation.
 *               Fires only on BUY/STRONG_BUY/GEM (~5% of scans typically).
 */
const SERPAPI_COST  = 0.025;
const DUFFEL_COST   = 0.005;
const ANTHROPIC_AVG = 0.005;

const SERPAPI_CALLS_PER_DAY = 9;     // 6 quick + 3 deep
const DUFFEL_CALLS_PER_DAY  = 1;
const AI_FIRE_RATE          = 0.05;  // ~5% of scans hit BUY threshold

export function estimateMonthlyCost({
  origins      = [],
  destinations = [],
  cabinClasses = [],
  dateCount    = 1,    // number of departure-date combos tracked per cycle
}) {
  const combos = Math.max(1, origins.length * destinations.length * cabinClasses.length * dateCount);

  const serpapiPerDay = combos * SERPAPI_CALLS_PER_DAY * SERPAPI_COST;
  const duffelPerDay  = combos * DUFFEL_CALLS_PER_DAY  * DUFFEL_COST;
  const aiPerDay      = combos * SERPAPI_CALLS_PER_DAY * AI_FIRE_RATE * ANTHROPIC_AVG;

  const monthly = (serpapiPerDay + duffelPerDay + aiPerDay) * 30;
  return {
    combos,
    serpapi:   +(serpapiPerDay * 30).toFixed(2),
    duffel:    +(duffelPerDay  * 30).toFixed(2),
    anthropic: +(aiPerDay      * 30).toFixed(2),
    seats_aero: 0,   // flat sub
    total:     +monthly.toFixed(2),
  };
}

export default function RouteCostEstimate({ origins, destinations, cabinClasses, dateCount = 1, compact = false }) {
  const cost = estimateMonthlyCost({ origins, destinations, cabinClasses, dateCount });

  if (compact) {
    return (
      <span className="text-xs text-zinc-500" title={`SerpApi $${cost.serpapi} · Duffel $${cost.duffel} · AI $${cost.anthropic}/mo`}>
        ~${cost.total}/mo to monitor
      </span>
    );
  }

  return (
    <div className="card p-4 bg-zinc-900/40 border border-zinc-800">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-wider text-zinc-500">Estimated monthly cost</p>
        <p className="text-2xl font-serif text-champagne">${cost.total}</p>
      </div>
      <div className="space-y-1.5 text-xs">
        <Row label="SerpApi (Google Flights)"   amount={cost.serpapi} />
        <Row label="Duffel (direct fares)"      amount={cost.duffel} />
        <Row label="Seats.aero (awards)"         amount="incl." note="flat $10/mo" />
        <Row label="Claude AI (recommendations)" amount={cost.anthropic} note="~5% of scans" />
      </div>
      <p className="text-[10px] text-zinc-600 mt-3 font-light">
        Estimate assumes {cost.combos} airport×cabin×date combo{cost.combos !== 1 ? "s" : ""}, scanned 9×/day.
        Actual cost varies with market activity.
      </p>
    </div>
  );
}

function Row({ label, amount, note }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-400">{label}</span>
      <span className="text-zinc-300 font-mono">
        {typeof amount === "number" ? `$${amount.toFixed(2)}` : amount}
        {note && <span className="text-zinc-600 ml-1.5 font-sans">({note})</span>}
      </span>
    </div>
  );
}
