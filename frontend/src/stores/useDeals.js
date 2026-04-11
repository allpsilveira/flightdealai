import { create } from "zustand";
import api from "../lib/api";

export const useDealsStore = create((set, get) => ({
  deals: [],
  loading: false,
  error: null,
  filters: {
    minScore: 0,
    cabinClass: null,
    gemsOnly: false,
    action: null,
  },

  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value } })),

  fetchDeals: async () => {
    set({ loading: true, error: null });
    const { filters } = get();
    try {
      const params = { min_score: filters.minScore };
      if (filters.cabinClass) params.cabin_class = filters.cabinClass;
      if (filters.action) params.action = filters.action;
      if (filters.gemsOnly) params.gems_only = true;

      const { data } = await api.get("/deals/", { params });
      set({ deals: data, loading: false });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  // Called by WebSocket handler to prepend a live deal
  addLiveDeal: (deal) =>
    set((s) => ({
      deals: [deal, ...s.deals.filter((d) => d.id !== deal.id)],
    })),
}));
