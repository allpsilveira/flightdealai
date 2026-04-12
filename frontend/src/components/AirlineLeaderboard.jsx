import { format } from "date-fns";

const AIRLINE_NAME = {
  AA: "American", UA: "United", DL: "Delta", LA: "LATAM",
  QR: "Qatar",    EK: "Emirates", LH: "Lufthansa", BA: "British Airways",
  AF: "Air France", SQ: "Singapore", CX: "Cathay Pacific",
  NH: "ANA",      JL: "JAL",   TK: "Turkish",  AZ: "ITA",
  G3: "GOL",      AD: "Azul",  JJ: "TAM",
};

const airlineLogo = (code) =>
  code ? `https://images.kiwi.com/airlines/64/${code}.png` : null;

const fmtMins = (mins) => {
  if (!mins) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

function StopBadge({ stops }) {
  if (stops === 0)
    return <span className="text-2xs font-semibold text-emerald-600 dark:text-emerald-400">Direct</span>;
  return <span className="text-2xs text-zinc-400">{stops} stop{stops > 1 ? "s" : ""}</span>;
}

export default function AirlineLeaderboard({ deals, onSelect, selectedDeal }) {
  if (!deals || deals.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-zinc-400 dark:text-zinc-500 italic">
          No airline data yet — run a scan to populate.
        </p>
      </div>
    );
  }

  // Deduplicate by airline_code + is_direct, show best price per combo
  const grouped = [];
  const seen = new Set();
  for (const deal of deals) {
    const key = `${deal.airline_code}-${deal.is_direct}`;
    if (!seen.has(key)) {
      seen.add(key);
      grouped.push(deal);
    }
  }

  return (
    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {grouped.map((deal, i) => {
        const isSelected = selectedDeal?.id === deal.id;
        const priceDelta = deal.price_prev_usd != null
          ? Math.round(deal.best_price_usd - deal.price_prev_usd)
          : null;

        return (
          <button
            key={deal.id}
            onClick={() => onSelect(deal)}
            className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-all rounded-lg
              ${isSelected
                ? "bg-brand-50 dark:bg-brand-500/10"
                : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              }`}
          >
            {/* Rank */}
            <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 w-4 flex-shrink-0 tabular-nums">
              {i + 1}
            </span>

            {/* Airline logo */}
            {deal.airline_code ? (
              <img
                src={airlineLogo(deal.airline_code)}
                alt={deal.airline_code}
                className="w-8 h-8 rounded-lg object-contain bg-white dark:bg-zinc-800
                           border border-zinc-100 dark:border-zinc-700 p-1 flex-shrink-0"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex-shrink-0" />
            )}

            {/* Name + meta */}
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">
                {AIRLINE_NAME[deal.airline_code] ?? deal.airline_code ?? "Unknown"}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <StopBadge stops={deal.is_direct ? 0 : 1} />
                {deal.departure_date && (
                  <span className="text-2xs text-zinc-400">
                    {format(new Date(deal.departure_date), "d MMM")}
                  </span>
                )}
              </div>
            </div>

            {/* Price */}
            <div className="text-right flex-shrink-0">
              <p className={`text-sm font-bold tabular-nums ${
                i === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-900 dark:text-white"
              }`}>
                ${deal.best_price_usd?.toLocaleString()}
              </p>
              {priceDelta != null && priceDelta !== 0 && (
                <p className={`text-2xs font-medium tabular-nums ${
                  priceDelta < 0 ? "text-emerald-500" : "text-red-500"
                }`}>
                  {priceDelta < 0 ? `↓$${Math.abs(priceDelta)}` : `↑$${priceDelta}`}
                </p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
