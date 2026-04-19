import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Client-side display preferences. Persisted to localStorage.
 * Server-side persistence (currency conversion via FX) lands in Phase 8.13.
 */
export const useSettingsStore = create(
  persist(
    (set) => ({
      language:   "en",          // en | es | pt
      currency:   "USD",         // USD | BRL | EUR | GBP
      dateFormat: "MM/DD/YYYY",  // MM/DD/YYYY | DD/MM/YYYY | YYYY-MM-DD

      setLanguage:   (language)   => set({ language }),
      setCurrency:   (currency)   => set({ currency }),
      setDateFormat: (dateFormat) => set({ dateFormat }),
    }),
    { name: "fld-settings" }
  )
);
