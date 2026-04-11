/**
 * Elegant dark map with gold airport pins and price overlays.
 * Uses MapLibre GL JS with a free dark tile style.
 * Phase 5 will wire up live price data; this renders the map skeleton.
 */
import { useEffect, useRef } from "react";

// MapLibre loaded from CDN — avoids bundling the large WASM module during Phase 1
const STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

export default function AirportMap({ airports = [], className = "" }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Dynamic import to keep bundle lean until needed
    import("maplibre-gl").then(({ default: maplibregl }) => {
      const map = new maplibregl.Map({
        container: containerRef.current,
        style:     STYLE_URL,
        center:    [-80.0, 24.0],   // South Florida default
        zoom:      5,
        attributionControl: false,
      });

      map.on("load", () => {
        airports.forEach((airport) => {
          // Gold pin marker
          const el = document.createElement("div");
          el.className = "airport-marker";
          el.style.cssText = `
            width: 10px; height: 10px;
            border-radius: 50%;
            background: #d4a843;
            border: 2px solid #f5c842;
            box-shadow: 0 0 12px rgba(212,168,67,0.6);
            cursor: pointer;
          `;

          // Price label
          const label = document.createElement("div");
          label.style.cssText = `
            position: absolute;
            bottom: 14px; left: 50%;
            transform: translateX(-50%);
            background: rgba(15,14,42,0.85);
            color: #d4a843;
            font-size: 11px;
            font-family: 'DM Sans', sans-serif;
            font-weight: 500;
            padding: 2px 6px;
            border-radius: 6px;
            border: 1px solid rgba(212,168,67,0.3);
            white-space: nowrap;
          `;
          label.textContent = airport.iata + (airport.price ? ` · $${airport.price}` : "");
          el.appendChild(label);

          new maplibregl.Marker({ element: el })
            .setLngLat([airport.lon, airport.lat])
            .setPopup(
              new maplibregl.Popup({ offset: 16, closeButton: false })
                .setHTML(`<p style="font-family:'DM Sans',sans-serif;font-size:12px;color:#fff;margin:0">
                  <strong>${airport.name}</strong><br/>${airport.city}
                  ${airport.price ? `<br/>Best: <strong style="color:#d4a843">$${airport.price}</strong>` : ""}
                </p>`)
            )
            .addTo(map);
        });
      });

      mapRef.current = map;
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`rounded-2xl overflow-hidden ${className}`}
      style={{ minHeight: 300 }}
    />
  );
}
