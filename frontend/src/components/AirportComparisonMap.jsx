/**
 * AirportComparisonMap — MapLibre GL map showing origin airports with prices
 * and nearby airports (from airports.json) within driving distance.
 *
 * Props:
 *   originCodes   — IATA[] — the route's tracked origin airports
 *   destCodes     — IATA[] — the route's destination airports
 *   dealsByOrigin — Record<IATA, { price_usd, departure_date }> — best price per origin
 */
import { useRef, useEffect } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import allAirports from "../data/airports.json";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

// Haversine distance in km
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function driveLabel(km) {
  if (km < 5) return "same area";
  const hours = km * 1.3 / 80; // 1.3× road factor, 80 km/h avg
  if (hours < 1) return `~${Math.round(hours * 60)}min drive`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `~${h}h ${m}m drive` : `~${h}h drive`;
}

export default function AirportComparisonMap({ originCodes, destCodes, dealsByOrigin }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markersRef = useRef([]);

  const airportMap = Object.fromEntries(allAirports.map((a) => [a.iata, a]));
  const allCodes = [...new Set([...(originCodes ?? []), ...(destCodes ?? [])])];
  const trackedOrigins = new Set(originCodes ?? []);
  const trackedDests = new Set(destCodes ?? []);

  // Find nearby airports within 600 km of any tracked origin
  const nearbyUntracked = allAirports.filter((ap) => {
    if (allCodes.includes(ap.iata)) return false;
    return (originCodes ?? []).some((code) => {
      const origin = airportMap[code];
      if (!origin) return false;
      return haversineKm(origin.lat, origin.lon, ap.lat, ap.lon) <= 600;
    });
  });

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    // Find all airports to show
    const toShow = [
      ...allCodes.map((c) => airportMap[c]).filter(Boolean),
      ...nearbyUntracked,
    ];

    if (toShow.length === 0) return;

    // Compute center
    const avgLat = toShow.reduce((s, a) => s + a.lat, 0) / toShow.length;
    const avgLon = toShow.reduce((s, a) => s + a.lon, 0) / toShow.length;

    const map = new maplibregl.Map({
      container: mapRef.current,
      style: MAP_STYLE,
      center: [avgLon, avgLat],
      zoom: toShow.length === 1 ? 8 : 5,
      attributionControl: false,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    mapInstance.current = map;

    map.on("load", () => {
      // Fit to all shown airports
      if (toShow.length > 1) {
        const bounds = new maplibregl.LngLatBounds();
        toShow.forEach((ap) => bounds.extend([ap.lon, ap.lat]));
        map.fitBounds(bounds, { padding: 48, maxZoom: 9, duration: 0 });
      }

      // Add markers
      const primaryOrigin = originCodes?.[0] ? airportMap[originCodes[0]] : null;

      toShow.forEach((ap) => {
        const isOrigin = trackedOrigins.has(ap.iata);
        const isDest = trackedDests.has(ap.iata);
        const isNearby = !isOrigin && !isDest;
        const deal = dealsByOrigin?.[ap.iata];

        const distKm = primaryOrigin && !isOrigin
          ? haversineKm(primaryOrigin.lat, primaryOrigin.lon, ap.lat, ap.lon)
          : 0;

        // Build popup content
        const priceHtml = deal
          ? `<p class="font-bold text-emerald-600">$${Math.round(deal.price_usd).toLocaleString()}</p>`
          : isNearby
          ? `<p class="text-zinc-400 text-xs">Not scanning yet</p>`
          : `<p class="text-zinc-400 text-xs">No data yet</p>`;

        const driveHtml = distKm > 5
          ? `<p class="text-zinc-400 text-xs">${driveLabel(distKm)} from ${primaryOrigin?.iata ?? ""}</p>`
          : "";

        const popup = new maplibregl.Popup({ offset: 25, closeButton: false })
          .setHTML(`
            <div style="font-family: system-ui, sans-serif; min-width: 120px">
              <p style="font-weight: 700; font-size: 14px; margin: 0 0 2px">${ap.iata}</p>
              <p style="font-size: 11px; color: #6b7280; margin: 0 0 4px">${ap.city} · ${ap.name}</p>
              ${priceHtml}
              ${driveHtml}
              ${isNearby ? '<p style="font-size: 10px; color: #9ca3af; margin-top: 4px">Add to route to compare prices</p>' : ""}
            </div>
          `);

        // Custom marker element
        const el = document.createElement("div");
        el.style.cssText = `
          width: ${isNearby ? "10px" : "14px"};
          height: ${isNearby ? "10px" : "14px"};
          border-radius: 50%;
          background: ${
            isDest ? "#1e293b" :
            isOrigin && deal ? "#f26419" :
            isOrigin ? "#3b82f6" :
            "#9ca3af"
          };
          border: 2px solid ${isNearby ? "#d1d5db" : "white"};
          cursor: pointer;
          opacity: ${isNearby ? "0.6" : "1"};
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        `;

        // Price label for tracked origins with deals
        if ((isOrigin || isDest) && deal) {
          const label = document.createElement("div");
          label.style.cssText = `
            position: absolute;
            bottom: 18px;
            left: 50%;
            transform: translateX(-50%);
            background: #f26419;
            color: white;
            font-size: 10px;
            font-weight: 700;
            padding: 1px 5px;
            border-radius: 4px;
            white-space: nowrap;
            pointer-events: none;
          `;
          label.textContent = `$${Math.round(deal.price_usd).toLocaleString()}`;
          el.style.position = "relative";
          el.appendChild(label);
        }

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([ap.lon, ap.lat])
          .setPopup(popup)
          .addTo(map);

        markersRef.current.push(marker);
      });
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  return (
    <div
      ref={mapRef}
      className="w-full h-52 rounded-xl overflow-hidden border border-zinc-100 dark:border-zinc-700"
    />
  );
}
