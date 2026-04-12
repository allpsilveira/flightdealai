import { create } from "zustand";
import api from "../lib/api";

export const useEventsStore = create((set) => ({
  // events per route: { [routeId]: event[] }
  events: {},
  loading: {},

  fetchEvents: async (routeId) => {
    set((s) => ({ loading: { ...s.loading, [routeId]: true } }));
    try {
      const { data } = await api.get(`/events/route/${routeId}`);
      set((s) => ({
        events: { ...s.events, [routeId]: data },
        loading: { ...s.loading, [routeId]: false },
      }));
    } catch {
      // Backend may not have /events endpoint yet — graceful empty state
      set((s) => ({
        events: { ...s.events, [routeId]: [] },
        loading: { ...s.loading, [routeId]: false },
      }));
    }
  },
}));
