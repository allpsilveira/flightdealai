import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuthStore } from "./stores/useAuth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import RouteManager from "./pages/RouteManager";
import PriceHistory from "./pages/PriceHistory";
import AirportCompare from "./pages/AirportCompare";
import AlertSettings from "./pages/AlertSettings";
import Settings from "./pages/Settings";
import Layout from "./components/Layout";

function RequireAuth({ children }) {
  const token = useAuthStore((s) => s.accessToken);
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
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
          <Route index element={<Dashboard />} />
          <Route path="routes" element={<RouteManager />} />
          <Route path="prices" element={<PriceHistory />} />
          <Route path="airports" element={<AirportCompare />} />
          <Route path="alerts" element={<AlertSettings />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
