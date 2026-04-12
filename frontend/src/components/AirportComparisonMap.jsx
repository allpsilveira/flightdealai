/**
 * AirportComparisonMap — MapLibre GL map showing origin airports with prices,
 * destination airports, and nearby airports within driving distance of both.
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
// Within ~3-4h drive (≈ 300 km straight-line)
const DRIVE_RADIUS_KM = 300;

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
  const hours = (km * 1.3) / 80; // 1.3× road factor, 80 km/h avg
  if (hours < 1) return `~${Math.round(hours * 60)}min drive`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `~${h}h ${m}m drive` : `~${h}h drive`;
}

export default function AirportComparisonMap({ originCodes, destCodes, dealsByOrigin }) {
  const mapRef      = useRef(null);
  const mapInstance = useRef(null);
  const markersRef  = useRef([]);

  const airportMap      = Object.fromEntries(allAirports.map((a) => [a.iata, a]));
  const allTrackedCodes = [...new Set([...(originCodes ?? []), ...(destCodes ?? [])])];
  const trackedOrigins  = new Set(originCodes ?? []);
  const trackedDests    = new Set(destCodes ?? []);

  // Nearby airports within DRIVE_RADIUS_KM of any tracked ORIGIN (alternative departure)
  const nearbyOrigins = allAirports.filter((ap) => {
    if (allTrackedCodes.includes(ap.iata)) return false;
    return (originCodes ?? []).some((code) => {
      const origin = airportMap[code];
      if (!origin) return false;
      return haversineKm(origin.lat, origin.lon, ap.lat, ap.lon) <= DRIVE_RADIUS_KM;
    });
  });

  // Nearby airports within DRIVE_RADIUS_KM of any tracked DESTINATION (alternative arrival)
  const nearbyDests = allAirports.filter((ap) => {
    if (allTrackedCodes.includes(ap.iata)) return false;
    if (nearbyOrigins.some((n) => n.iata === ap.iata)) return false; // avoid duplicates
    return (destCodes ?? []).some((code) => {
      const dest = airportMap[code];
      if (!dest) return false;
      return haversineKm(dest.lat, dest.lon, ap.lat, ap.lon) <= DRIVE_RADIUS_KM;
    });
  });

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const toShow = [
      ...allTrackedCodes.map((c) => airportMap[c]).filter(Boolean),
      ...nearbyOrigins,
      ...nearbyDests,
    ];

    if (toShow.length === 0) return;

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
      if (toShow.length > 1) {
        const bounds = new maplibregl.LngLatBounds();
        toShow.forEach((ap) => bounds.extend([ap.lon, ap.lat]));
        map.fitBounds(bounds, { padding: 52, maxZoom: 9, duration: 0 });
      }

      // Pick the primary reference origin for drive-time calculations
      const primaryOrigin = originCodes?.[0] ? airportMap[originCodes[0]] : null;
      const primaryDest   = destCodes?.[0]   ? airportMap[destCodes[0]]   : null;

      const addMarker = (ap, role) => {
        const isOrigin      = role === "origin";
        const isDest        = role === "dest";
        const isNearOrigin  = role === "near-origin";
        const isNearDest    = role === "near-dest";
        const deal          = dealsByOrigin?.[ap.iata];

        // Drive time — from primary origin for alt-origins, from primary dest for alt-dests
        const ref = isNearOrigin ? primaryOrigin : isNearDest ? primaryDest : null;
        const distKm = ref
          ? haversineKm(ref.lat, ref.lon, ap.lat, ap.lon)
          : 0;

        // Popup
        const priceHtml = deal
          ? `<p style="font-weight:700;font-size:15px;color:#059669;margin:2px 0">\$${Math.round(deal.price_usd).toLocaleString()}</p>`
          : (isNearOrigin || isNearDest)
          ? `<p style="font-size:11px;color:#9ca3af;margin:2px 0">Not tracking — add to route</p>`
          : `<p style="font-size:11px;color:#9ca3af;margin:2px 0">No scan data yet</p>`;

        const roleHtml = isDest
          ? `<p style="font-size:10px;color:#6366f1;font-weight:600;margin:2px 0">Destination</p>`
          : isNearOrigin
          ? `<p style="font-size:10px;color:#6b7280;margin:2px 0">Alt. departure · ${driveLabel(distKm)}</p>`
          : isNearDest
          ? `<p style="font-size:10px;color:#6b7280;margin:2px 0">Alt. arrival · ${driveLabel(distKm)} from ${primaryDest?.iata ?? ""}</p>`
          : "";

        const popup = new maplibregl.Popup({ offset: 26, closeButton: false })
          .setHTML(`
            <div style="font-family:system-ui,sans-serif;min-width:130px;padding:2px 0">
              <p style="font-weight:700;font-size:14px;margin:0 0 1px">${ap.iata}</p>
              <p style="font-size:11px;color:#6b7280;margin:0 0 4px">${ap.city} · ${ap.name}</p>
              ${priceHtml}
              ${roleHtml}
              ${(isNearOrigin || isNearDest) ? '<p style="font-size:10px;color:#9ca3af;margin-top:4px">Add to route to compare prices</p>' : ""}
            </div>
          `);

        // Marker element
        const size    = (isNearOrigin || isNearDest) ? "10px" : "14px";
        const color   =
          isDest        ? "#4f46e5" :   // indigo for destination
          isOrigin && deal ? "#f26419" :  // brand orange = tracked + price
          isOrigin      ? "#3b82f6" :    // blue = tracked, no price yet
          isNearOrigin  ? "#9ca3af" :    // grey = alt departure
          "#a78bfa";                     // purple-ish = alt arrival

        const el = document.createElement("div");
        el.style.cssText = `
          width: ${size};
          height: ${size};
          border-radius: 50%;
          background: ${color};
          border: 2px solid ${(isNearOrigin || isNearDest) ? "#e5e7eb" : "white"};
          cursor: pointer;
          opacity: ${(isNearOrigin || isNearDest) ? "0.65" : "1"};
          box-shadow: 0 1px 4px rgba(0,0,0,0.25);
          position: relative;
        `;

        // Price label for tracked airports that have deal data
        if ((isOrigin || isDest) && deal) {
          const label = document.createElement("div");
          label.style.cssText = `
            position: absolute;
            bottom: 18px;
            left: 50%;
            transform: translateX(-50%);
            background: ${isDest ? "#4f46e5" : "#f26419"};
            color: white;
            font-size: 10px;
            font-weight: 700;
            padding: 1px 5px;
            border-radius: 4px;
            white-space: nowrap;
            pointer-events: none;
          `;
          label.textContent = `\$${Math.round(deal.price_usd).toLocaleString()}`;
          el.appendChild(label);
        }

        // Drive-time label on nearby airports
        if ((isNearOrigin || isNearDest) && distKm > 5) {
          const driveTag = document.createElement("div");
          driveTag.style.cssText = `
            position: absolute;
            bottom: 14px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.55);
            color: white;
            font-size: 9px;
            padding: 1px 4px;
            border-radius: 3px;
            white-space: nowrap;
            pointer-events: none;
          `;
          driveTag.textContent = driveLabel(distKm);
          el.appendChild(driveTag);
        }

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([ap.lon, ap.lat])
          .setPopup(popup)
          .addTo(map);

        markersRef.current.push(marker);
      };

      // Render all airports
      allTrackedCodes.forEach((code) => {
        const ap = airportMap[code];
        if (!ap) return;
        if (trackedOrigins.has(code)) addMarker(ap, "origin");
        else if (trackedDests.has(code)) addMarker(ap, "dest");
      });
      nearbyOrigins.forEach((ap) => addMarker(ap, "near-origin"));
      nearbyDests.forEach((ap) => addMarker(ap, "near-dest"));
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  // Legend
  return (
    <div className="space-y-1.5">
      <div
        ref={mapRef}
        className="w-full h-52 rounded-xl overflow-hidden border border-zinc-100 dark:border-zinc-700"
      />
      <div className="flex items-center gap-4 flex-wrap px-1">
        <LegendDot color="#f26419" label="Tracked origin" />
        <LegendDot color="#4f46e5" label="Destination" />
        <LegendDot color="#9ca3af" label="Alt. departure (drive)" />
        <LegendDot color="#a78bfa" label="Alt. arrival (drive)" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
      <span className="text-xs text-zinc-400 dark:text-zinc-500">{label}</span>
    </div>
  );
}
