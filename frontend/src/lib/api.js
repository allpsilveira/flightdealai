import axios from "axios";
import { useAuthStore } from "../stores/useAuth";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "/api",
  timeout: 120_000,   // 120s — scans on large routes can take 60-90s
});

// Attach access token
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    // Network error (backend not running) — don't crash, just reject quietly
    if (!err.response) return Promise.reject(err);
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        await useAuthStore.getState().refresh();
        const token = useAuthStore.getState().accessToken;
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        useAuthStore.getState().logout();
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export default api;
