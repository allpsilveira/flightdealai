import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuthStore } from "./stores/useAuth";
import { useDealsWebSocket } from "./hooks/useDealsWebSocket";
import Layout from "./components/Layout";
import ErrorBoundary from "./components/ErrorBoundary";

// Lazy-loaded pages — each becomes a separate chunk (reduces initial bundle ~60%)
const Login = lazy(() => import("./pages/Login"));
const Home = lazy(() => import("./pages/Home"));
const RouteDetail = lazy(() => import("./pages/RouteDetail"));
const Settings = lazy(() => import("./pages/Settings"));

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0a0e1a]">
      <div className="animate-pulse text-champagne/60 font-serif text-lg">
        Loading…
      </div>
    </div>
  );
}

function RequireAuth({ children }) {
  const token = useAuthStore((s) => s.accessToken);
  // Open the live-deal WebSocket once the user is authenticated.
  // Hook auto-reconnects with exponential backoff and tears down on logout.
  useDealsWebSocket();
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route index element={<ErrorBoundary><Home /></ErrorBoundary>} />
              <Route path="route/:id" element={<ErrorBoundary><RouteDetail /></ErrorBoundary>} />
              <Route path="settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
            </Route>
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
