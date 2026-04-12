/**
 * AirlineLeaderboard — shows cheapest price per airline for a route.
 *
 * Props:
 *   offers      — FlightOffer[] from GET /deals/{id}/offers (per-airline from SerpApi)
 *   parentDeal  — the DealAnalysis row that owns these offers (for TicketDetailPanel)
 *   onSelect    — called with parentDeal when a row is clicked
 *   selectedDeal — currently selected deal (for highlight)
 */

const AIRLINE_NAME = {
  // North / Central America
  AA: "American Airlines",
  UA: "United Airlines",
  DL: "Delta Air Lines",
  WN: "Southwest",
  B6: "JetBlue",
  AS: "Alaska Airlines",
  F9: "Frontier",
  NK: "Spirit",
  CM: "Copa Airlines",
  AM: "Aeroméxico",
  MX: "Mexicana",

  // South America
  LA: "LATAM Airlines",
  G3: "GOL",
  AD: "Azul",
  JJ: "LATAM Brasil",
  AV: "Avianca",
  AR: "Aerolíneas Argentinas",
  H2: "Sky Airline",
  JA: "JetSMART",

  // Europe
  BA: "British Airways",
  AF: "Air France",
  LH: "Lufthansa",
  KL: "KLM",
  IB: "Iberia",
  TP: "TAP Air Portugal",
  LX: "Swiss",
  OS: "Austrian",
  AZ: "ITA Airways",
  SK: "SAS",
  AY: "Finnair",
  EI: "Aer Lingus",
  VY: "Vueling",
  U2: "easyJet",
  FR: "Ryanair",
  VS: "Virgin Atlantic",
  TK: "Turkish Airlines",

  // Middle East / Africa
  EK: "Emirates",
  QR: "Qatar Airways",
  EY: "Etihad",
  ET: "Ethiopian Airlines",
  MS: "EgyptAir",
  SA: "South African Airways",
  KQ: "Kenya Airways",

  // Asia / Pacific
  SQ: "Singapore Airlines",
  CX: "Cathay Pacific",
  NH: "ANA",
  JL: "JAL",
  TG: "Thai Airways",
  MH: "Malaysia Airlines",
  GA: "Garuda Indonesia",
  OZ: "Asiana",
  KE: "Korean Air",
  CI: "China Airlines",
  BR: "EVA Air",
  CZ: "China Southern",
  MU: "China Eastern",
  CA: "Air China",
  AI: "Air India",

  // Canada / Other
  AC: "Air Canada",
  WS: "WestJet",
  QF: "Qantas",
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
    return <span className="text-2xs font-semibold text-emerald-600 dark:text-emerald-400">Direct</span>;
  return <span className="text-2xs text-zinc-500 dark:text-zinc-400">{stops} stop{stops > 1 ? "s" : ""}</span>;
}

export default function AirlineLeaderboard({ offers, parentDeal, onSelect, selectedDeal }) {
  // If no offers yet (pre-scan), fall back gracefully
  if (!offers || offers.length === 0) {
    return (
      <div className="text-center py-8 px-4">
        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300 mb-1">
          No airline breakdown yet
        </p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Click "Scan Now" to load per-airline prices.
        </p>
      </div>
    );
  }

  // Group by primary_airline — keep cheapest offer per airline
  const byAirline = new Map();
  for (const offer of offers) {
    const key = offer.primary_airline ?? "??";
    if (!byAirline.has(key) || offer.price_usd < byAirline.get(key).price_usd) {
      byAirline.set(key, offer);
    }
  }

  // Sort by price ascending
  const rows = [...byAirline.values()].sort((a, b) => a.price_usd - b.price_usd);

  return (
    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {rows.map((offer, i) => {
        const code = offer.primary_airline;
        const isSelected = selectedDeal?.id === parentDeal?.id && i === 0;

        return (
          <button
            key={`${code}-${offer.stops}`}
            onClick={() => onSelect(parentDeal)}
            className={`w-full flex items-center gap-3 px-3 py-3.5 text-left transition-all rounded-lg
              ${isSelected
                ? "bg-brand-50 dark:bg-brand-500/10"
                : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              }`}
          >
            {/* Rank */}
            <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 w-5 flex-shrink-0 tabular-nums text-center">
              {i + 1}
            </span>

            {/* Airline logo */}
            {code ? (
              <img
                src={airlineLogo(code)}
                alt={code}
                className="w-9 h-9 rounded-lg object-contain bg-white dark:bg-zinc-800
                           border border-zinc-200 dark:border-zinc-700 p-1 flex-shrink-0"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex-shrink-0" />
            )}

            {/* Name + meta */}
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                {AIRLINE_NAME[code] ?? code ?? "Unknown"}
              </p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <StopBadge stops={offer.stops} />
                {offer.duration_minutes && (
                  <span className="text-2xs text-zinc-400 dark:text-zinc-500">
                    {fmtMins(offer.duration_minutes)}
                  </span>
                )}
              </div>
            </div>

            {/* Price */}
            <div className="text-right flex-shrink-0">
              <p className={`text-sm font-bold tabular-nums ${
                i === 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-zinc-900 dark:text-white"
              }`}>
                ${offer.price_usd?.toLocaleString()}
              </p>
              {i === 0 && (
                <p className="text-2xs text-emerald-500 dark:text-emerald-400 font-medium">Best</p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
