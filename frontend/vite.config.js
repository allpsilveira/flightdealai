import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const BACKEND = process.env.VITE_BACKEND_HOST ?? "localhost";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: `http://${BACKEND}:8000`,
        changeOrigin: true,
      },
      "/ws": {
        target: `ws://${BACKEND}:8000`,
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          charts: ["recharts"],
          maps: ["maplibre-gl", "react-map-gl"],
          state: ["zustand", "axios"],
        },
      },
    },
    chunkSizeWarningLimit: 500,
    sourcemap: false,
  },
});
