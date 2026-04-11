export default function AwardComparison({ miles, program, cpp, cashPrice }) {
  if (!miles || !program) return null;

  const savingsVsCash = cashPrice ? cashPrice - (miles / 100 * (cpp ?? 1)) : null;

  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-gold-500/5 border border-gold-500/15">
      <span className="text-gold-500 text-base mt-0.5">◈</span>
      <div>
        <p className="text-sm font-sans text-white/80 font-medium">
          {miles.toLocaleString()} miles
          <span className="text-white/40 font-normal"> via {program}</span>
        </p>
        {cpp && (
          <p className="text-xs font-sans text-gold-400/70 mt-0.5">
            {cpp.toFixed(1)}¢/point
            {savingsVsCash && savingsVsCash > 0 && (
              <span className="text-emerald-400/70 ml-2">
                saves ~${savingsVsCash.toFixed(0)}
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
