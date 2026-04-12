import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useSettingsStore = create(
  persist(
    (set) => ({
      language: "en", // en | es | pt
      setLanguage: (lang) => set({ language: lang }),
    }),
    { name: "fld-settings" }
  )
);
