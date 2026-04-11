import { create } from "zustand";
import api from "../lib/api";

export const useAlertsStore = create((set) => ({
  rules: [],
  loading: false,

  fetchRules: async () => {
    set({ loading: true });
    try {
      const { data } = await api.get("/alerts/");
      set({ rules: data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createRule: async (payload) => {
    const { data } = await api.post("/alerts/", payload);
    set((s) => ({ rules: [...s.rules, data] }));
    return data;
  },

  deleteRule: async (id) => {
    await api.delete(`/alerts/${id}`);
    set((s) => ({ rules: s.rules.filter((r) => r.id !== id) }));
  },
}));
