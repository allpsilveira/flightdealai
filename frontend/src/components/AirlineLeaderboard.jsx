/**
 * AirlineLeaderboard — top offers sorted by value (savings ÷ extra hours).
 *
 * Props:
 *   offers      — FlightOffer[] from GET /deals/offers/route/{id}
 *   parentDeal  — fallback DealAnalysis if deal_analysis_id lookup fails
 *   dealMap     — Map<deal.id, deal> for resolving the correct panel per airline
 *   onSelect    — called with a DealAnalysis when a row is clicked
 *   selectedDeal — currently open deal (for highlight)
 */
import { format } from "date-fns";

const AIRLINE_NAME = {
  AA: "American Airlines",  UA: "United Airlines",   DL: "Delta Air Lines",
  WN: "Southwest",          B6: "JetBlue",            AS: "Alaska Airlines",
  F9: "Frontier",           NK: "Spirit",             CM: "Copa Airlines",
  AM: "Aeroméxico",         MX: "Mexicana",
  LA: "LATAM Airlines",     G3: "GOL",                AD: "Azul",
  JJ: "LATAM Brasil",       AV: "Avianca",            AR: "Aerolíneas Argentinas",
  H2: "Sky Airline",        JA: "JetSMART",
  BA: "British Airways",    AF: "Air France",         LH: "Lufthansa",
  KL: "KLM",                IB: "Iberia",             TP: "TAP Air Portugal",
  LX: "Swiss",              OS: "Austrian",            AZ: "ITA Airways",
  SK: "SAS",                AY: "Finnair",             EI: "Aer Lingus",
  VY: "Vueling",            VS: "Virgin Atlantic",    TK: "Turkish Airlines",
  EK: "Emirates",           QR: "Qatar Airways",      EY: "Etihad",
  ET: "Ethiopian Airlines", MS: "EgyptAir",           SA: "South African Airways",
  KQ: "Kenya Airways",
  SQ: "Singapore Airlines", CX: "Cathay Pacific",    NH: "ANA",
  JL: "JAL",                TG: "Thai Airways",       MH: "Malaysia Airlines",
  GA: "Garuda Indonesia",   OZ: "Asiana",             KE: "Korean Air",
  CI: "China Airlines",     BR: "EVA Air",            CZ: "China Southern",
  MU: "China Eastern",      CA: "Air China",          AI: "Air India",
  AC: "Air Canada",         WS: "WestJet",            QF: "Qantas",
  NZ: "Air New Zealand",
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
    return <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Direct</span>;
  return <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">{stops} stop{stops > 1 ? "s" : ""}</span>;
}

export default function AirlineLeaderboard({ offers, parentDeal, dealMap, onSelect, selectedDeal }) {
  if (!offers || offers.length === 0) {
    return (
      <div className="text-center py-10 px-4">
        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300 mb-1">
          No airline breakdown yet
        </p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Click "Scan Now" to load per-airline prices.
        </p>
      </div>
    );
  }

  // Dedup on (airline, stops) — keep cheapest per combo
  const byCombo = new Map();
  for (const offer of offers) {
    const key = `${offer.primary_airline ?? "??"}|${offer.stops ?? 0}`;
    if (!byCombo.has(key) || offer.price_usd < byCombo.get(key).price_usd) {
      byCombo.set(key, offer);
    }
  }

  const rows = [...byCombo.values()].sort((a, b) => a.price_usd - b.price_usd).slice(0, 7);
  const cheapestPrice = rows[0]?.price_usd ?? 0;

  // Baseline for value calculation: cheapest direct flight, or cheapest overall
  const directPrices = rows.filter((o) => o.stops === 0).map((o) => o.price_usd);
  const directBaseline = directPrices.length ? Math.min(...directPrices) : null;
  const minDuration = Math.min(...rows.map((o) => o.duration_minutes).filter(Boolean));

  return (
    <div>
      {/* Column headers */}
      <div className="flex items-center gap-2 px-3 pb-1.5 border-b border-zinc-100 dark:border-zinc-800">
        <span className="w-5 flex-shrink-0" />
        <span className="w-9 flex-shrink-0" />
        <span className="flex-1 text-2xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">Airline</span>
        <span className="text-2xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide w-24 text-right">Price · Value</span>
      </div>

      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {rows.map((offer, i) => {
          const code = offer.primary_airline;
          const name = AIRLINE_NAME[code] ?? code ?? "Unknown Airline";

          const linkedDeal = offer.deal_analysis_id
            ? (dealMap?.get(offer.deal_analysis_id) ?? parentDeal)
            : parentDeal;
          const isSelected = selectedDeal?.id && linkedDeal?.id === selectedDeal.id;

          // Value score: how much you save per extra hour vs the direct baseline (or cheapest)
          const baseline = directBaseline ?? cheapestPrice;
          const savings = i === 0 ? null : Math.round(baseline - offer.price_usd);
          const extraMins = offer.duration_minutes && minDuration
            ? offer.duration_minutes - minDuration : 0;
          const extraHours = extraMins / 60;

          // savingsPerHour: positive = saves money per extra hour; null for cheapest row
          const savingsPerHour = savings != null && extraHours > 0.5
            ? Math.round(savings / extraHours) : null;

          // Value label color
          const valueBg = savingsPerHour == null ? null
            : savingsPerHour >= 250 ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
            : savingsPerHour >= 100 ? "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300"
            : "bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400";

          const dateStr = offer.departure_date?.replace(/-/g, "") ?? null;
          const skyScanUrl = offer.origin && offer.destination && dateStr
            ? `https://www.skyscanner.com/transport/flights/${offer.origin.toLowerCase()}/${offer.destination.toLowerCase()}/${dateStr}/?cabin_class=business&adultsv2=1`
            : null;

          return (
            <div
              key={`${code}-${offer.stops}-${i}`}
              className={`flex items-center gap-2 px-3 py-3 transition-all ${
                isSelected
                  ? "bg-champagne/10 border-l-2 border-champagne"
                  : "hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
              }`}
            >
              {/* Rank */}
              <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 w-5 flex-shrink-0 text-center tabular-nums">
                {i + 1}
              </span>

              {/* Logo */}
              {code ? (
                <img src={airlineLogo(code)} alt={code}
                  className="w-9 h-9 rounded-lg object-contain bg-white dark:bg-zinc-800
                             border border-zinc-200 dark:border-zinc-700 p-1 flex-shrink-0"
                  onError={(e) => { e.currentTarget.style.display = "none"; }} />
              ) : (
                <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex-shrink-0" />
              )}

              {/* Airline + meta */}
              <button
                onClick={() => linkedDeal && onSelect(linkedDeal)}
                className="flex-1 min-w-0 text-left"
              >
                <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate leading-tight">
                  {name}
                </p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <StopBadge stops={offer.stops} />
                  {offer.duration_minutes && (
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      {fmtMins(offer.duration_minutes)}
                    </span>
                  )}
                  {offer.departure_date && (
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      {format(new Date(offer.departure_date + "T12:00:00"), "d MMM")}
                    </span>
                  )}
                </div>
              </button>

              {/* Price + value badge */}
              <div className="text-right flex-shrink-0 flex flex-col items-end gap-1 min-w-[72px]">
                <p className={`text-sm font-bold tabular-nums ${
                  i === 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-zinc-900 dark:text-white"
                }`}>
                  ${offer.price_usd?.toLocaleString()}
                </p>

                {i === 0 && (
                  <span className="text-xs text-emerald-500 dark:text-emerald-400 font-semibold">Cheapest</span>
                )}

                {/* Value score badge */}
                {savingsPerHour != null && (
                  <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded-md ${valueBg}`}>
                    ${savingsPerHour}/hr saved
                  </span>
                )}

                {/* Savings vs direct */}
                {savings != null && savings > 0 && offer.stops > 0 && (
                  <span className="text-2xs text-zinc-400 dark:text-zinc-500">
                    −${savings.toLocaleString()} vs direct
                  </span>
                )}

                {/* Search link */}
                {skyScanUrl && (
                  <a href={skyScanUrl} target="_blank" rel="noopener noreferrer"
                     onClick={(e) => e.stopPropagation()}
                     className="text-2xs text-champagne/80 hover:text-champagne font-medium">
                    Search ↗
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      {rows.some((o) => o.stops > 0) && (
        <div className="px-3 pt-2 pb-1 border-t border-zinc-100 dark:border-zinc-800">
          <p className="text-2xs text-zinc-400 dark:text-zinc-500 leading-snug">
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">$/hr saved</span> = money saved per extra hour of travel vs the cheapest direct flight. Higher = better value connecting option.
          </p>
        </div>
      )}
    </div>
  );
}
