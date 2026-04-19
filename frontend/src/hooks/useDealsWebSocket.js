import { useEffect, useRef } from "react";
import { useAuthStore } from "../stores/useAuth";
import { useRoutesStore } from "../stores/useRoutes";
import { useEventsStore } from "../stores/useEvents";

/**
 * Connects to /ws/deals using the current access token.
 * Auto-reconnects with exponential backoff on disconnect.
 * Dispatches incoming events into the routes + events stores.
 *
 * Server message formats:
 *   { event: "deal_update", data: { ...deal } }
 *   { event: "new_events",  route_id: "uuid", data: [event...] }
 *   { event: "ping" } / { event: "pong" }
 */
export function useDealsWebSocket() {
  const accessToken    = useAuthStore((s) => s.accessToken);
  const wsRef          = useRef(null);
  const reconnectTimer = useRef(null);
  const attemptRef     = useRef(0);
  const closedByUs     = useRef(false);

  useEffect(() => {
    if (!accessToken) return;

    closedByUs.current = false;

    const connect = () => {
      // Build ws URL relative to current origin
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const apiBase = import.meta.env.VITE_API_URL ?? "/api";
      // ws path lives under /ws/, not /api — we strip leading /api if present
      const host = window.location.host;
      const url  = `${proto}//${host}/ws/deals?token=${encodeURIComponent(accessToken)}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        attemptRef.current = 0;
      };

      ws.onmessage = (msg) => {
        let payload;
        try { payload = JSON.parse(msg.data); } catch { return; }

        if (payload.event === "ping") {
          try { ws.send("pong"); } catch { /* ignore */ }
          return;
        }

        if (payload.event === "deal_update" && payload.data) {
          const deal = payload.data;
          const routeId = deal.route_id;
          if (!routeId) return;
          const store = useRoutesStore.getState();
          // Update bestDeals if this beats the existing best
          const existing = store.bestDeals[routeId];
          if (!existing || deal.score_total >= (existing.score_total ?? 0)) {
            useRoutesStore.setState((s) => ({
              bestDeals: { ...s.bestDeals, [routeId]: { ...existing, ...deal } },
            }));
          }
          // Touch scanMeta so RouteCards re-render with fresh "Last scan" text
          useRoutesStore.setState((s) => ({
            scanMeta: {
              ...s.scanMeta,
              [routeId]: {
                ...(s.scanMeta[routeId] ?? {}),
                time: new Date(),
                scored: ((s.scanMeta[routeId]?.scored ?? 0) + 1),
              },
            },
          }));
          return;
        }

        if (payload.event === "new_events" && Array.isArray(payload.data)) {
          const routeId = payload.route_id;
          if (!routeId) return;
          useEventsStore.setState((s) => ({
            events: {
              ...s.events,
              [routeId]: [...payload.data, ...(s.events[routeId] ?? [])].slice(0, 200),
            },
          }));
          return;
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (closedByUs.current) return;
        // Exponential backoff: 1s, 2s, 4s, 8s, capped 30s
        const delay = Math.min(30_000, 1_000 * 2 ** attemptRef.current);
        attemptRef.current += 1;
        reconnectTimer.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        try { ws.close(); } catch { /* ignore */ }
      };
    };

    connect();

    return () => {
      closedByUs.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch { /* ignore */ }
        wsRef.current = null;
      }
    };
  }, [accessToken]);
}
