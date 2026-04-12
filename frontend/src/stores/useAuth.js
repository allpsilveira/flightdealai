import { create } from "zustand";
import { persist } from "zustand/middleware";
import api from "../lib/api";

export const useAuthStore = create(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,

      login: async (email, password) => {
        const { data } = await api.post("/auth/login", { email, password });
        set({ accessToken: data.access_token, refreshToken: data.refresh_token });
        const me = await api.get("/auth/me", {
          headers: { Authorization: `Bearer ${data.access_token}` },
        });
        set({ user: me.data });
      },

      register: async (email, password, language = "en") => {
        const { data } = await api.post("/auth/register", { email, password, language });
        set({ accessToken: data.access_token, refreshToken: data.refresh_token });
        const me = await api.get("/auth/me", {
          headers: { Authorization: `Bearer ${data.access_token}` },
        });
        set({ user: me.data });
      },

      refresh: async () => {
        const token = get().refreshToken;
        if (!token) throw new Error("No refresh token");
        const { data } = await api.post("/auth/refresh", { refresh_token: token });
        set({ accessToken: data.access_token, refreshToken: data.refresh_token });
      },

      logout: () => set({ accessToken: null, refreshToken: null, user: null }),

      updateUser: (patch) => set((s) => ({ user: { ...s.user, ...patch } })),
    }),
    {
      name: "flightdeal-auth",
      partialize: (s) => ({ accessToken: s.accessToken, refreshToken: s.refreshToken, user: s.user }),
    }
  )
);
