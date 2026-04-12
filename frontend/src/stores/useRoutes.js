import { create } from "zustand";
import api from "../lib/api";

export const useRoutesStore = create((set, get) => ({
  routes: [],
  loading: false,
  error: null,
  // Best deal per route: { [routeId]: deal }
  bestDeals: {},
  // Scan state per route: { [routeId]: bool }
  scanning: {},
  // Scan metadata per route: { [routeId]: { found, scored, time, error } }
  scanMeta: {},

  fetchRoutes: async () => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.get("/routes/");
      set({ routes: data, loading: false });
      data.forEach((route) => get().fetchBestDeal(route.id));
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  fetchBestDeal: async (routeId) => {
    try {
      const { data } = await api.get("/deals/", {
        params: { route_id: routeId, limit: 1 },
      });
      set((s) => ({
        bestDeals: {
          ...s.bestDeals,
          [routeId]: data.length > 0 ? data[0] : null,
        },
      }));
    } catch {
      /* graceful — no deal data yet */
    }
  },

  createRoute: async (body) => {
    const { data } = await api.post("/routes/", body);
    set((s) => ({ routes: [...s.routes, data] }));
    get().fetchBestDeal(data.id);
    return data;
  },

  updateRoute: async (id, body) => {
    const { data } = await api.patch(`/routes/${id}`, body);
    set((s) => ({
      routes: s.routes.map((r) => (r.id === id ? data : r)),
    }));
  },

  deleteRoute: async (id) => {
    await api.delete(`/routes/${id}`);
    set((s) => ({
      routes: s.routes.filter((r) => r.id !== id),
      bestDeals: Object.fromEntries(
        Object.entries(s.bestDeals).filter(([k]) => k !== id)
      ),
    }));
  },

  scanRoute: async (routeId) => {
    set((s) => ({ scanning: { ...s.scanning, [routeId]: true } }));
    try {
      const { data } = await api.post(`/scan/route/${routeId}`);
      set((s) => ({
        scanMeta: {
          ...s.scanMeta,
          [routeId]: {
            found: data.sources?.serpapi ?? 0,
            scored: data.deals_scored ?? 0,
            time: new Date(),
          },
        },
      }));
      await get().fetchBestDeal(routeId);
    } catch {
      set((s) => ({
        scanMeta: { ...s.scanMeta, [routeId]: { error: true } },
      }));
    } finally {
      set((s) => ({ scanning: { ...s.scanning, [routeId]: false } }));
    }
  },
}));
