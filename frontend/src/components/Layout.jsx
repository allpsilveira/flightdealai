import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/useAuth";
import { useDarkMode } from "../hooks/useDarkMode";
import clsx from "clsx";

const NAV = [
  { to: "/",         label: "Deal Feed",       icon: <IconDeals /> },
  { to: "/routes",   label: "Monitoring",       icon: <IconScan /> },
  { to: "/prices",   label: "Price History",    icon: <IconChart /> },
  { to: "/airports", label: "Airport Compare",  icon: <IconMap /> },
  { to: "/alerts",   label: "Alerts",           icon: <IconBell /> },
  { to: "/settings", label: "Settings",         icon: <IconSettings /> },
];

export default function Layout() {
  const user    = useAuthStore((s) => s.user);
  const logout  = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [dark, setDark] = useDarkMode();

  const handleLogout = () => { logout(); navigate("/login"); };

  return (
    <div className="flex min-h-screen bg-sand-50 dark:bg-zinc-950">
      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside className="w-60 flex-shrink-0 flex flex-col
                        bg-white dark:bg-zinc-900
                        border-r border-zinc-200 dark:border-zinc-800">

        {/* Logo */}
        <div className="px-5 pt-7 pb-5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 10L7 2L12 10" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="7" cy="11.5" r="1.5" fill="white"/>
              </svg>
            </div>
            <div>
              <span className="text-sm font-semibold text-zinc-900 dark:text-white tracking-tight">
                FlyLuxury<span className="text-brand-500">Deals</span>
              </span>
            </div>
          </div>
        </div>

        <div className="divider mx-4 mb-4" />

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-0.5">
          {NAV.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150",
                  isActive
                    ? "bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400"
                    : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100"
                )
              }
            >
              <span className="w-4 h-4 flex-shrink-0">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-3 pb-5 pt-4 space-y-1">
          <div className="divider mb-3" />

          {/* Dark mode toggle */}
          <button
            onClick={() => setDark(!dark)}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm
                       text-zinc-500 dark:text-zinc-400
                       hover:bg-zinc-50 dark:hover:bg-zinc-800
                       hover:text-zinc-900 dark:hover:text-zinc-100
                       transition-all duration-150"
          >
            <span className="w-4 h-4 flex-shrink-0">
              {dark ? <IconSun /> : <IconMoon />}
            </span>
            {dark ? "Light mode" : "Dark mode"}
          </button>

          {/* User + logout */}
          <div className="px-3 py-2">
            <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate mb-2">
              {user?.email}
            </p>
            <button
              onClick={handleLogout}
              className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

/* ── Inline SVG icons ────────────────────────────────────────────────────── */
function IconDeals() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/>
    <rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>
  </svg>;
}
function IconRoutes() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="3" cy="8" r="1.5"/><circle cx="13" cy="8" r="1.5"/>
    <path d="M4.5 8h7"/>
    <path d="M8 4.5l2 2-2 2"/>
  </svg>;
}
function IconScan() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2"/>
  </svg>;
}
function IconChart() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <polyline points="2,12 5,7 8,9 11,5 14,8"/>
  </svg>;
}
function IconMap() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M8 2C5.8 2 4 3.8 4 6c0 3 4 8 4 8s4-5 4-8c0-2.2-1.8-4-4-4z"/>
    <circle cx="8" cy="6" r="1.2" fill="currentColor" stroke="none"/>
  </svg>;
}
function IconBell() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M8 2a4 4 0 0 1 4 4v2l1 2H3l1-2V6a4 4 0 0 1 4-4z"/>
    <path d="M6.5 12a1.5 1.5 0 0 0 3 0"/>
  </svg>;
}
function IconSettings() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="8" cy="8" r="2"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"/>
  </svg>;
}
function IconSun() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="8" cy="8" r="2.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"/>
  </svg>;
}
function IconMoon() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M13.5 9A6 6 0 0 1 7 2.5a6 6 0 1 0 6.5 6.5z"/>
  </svg>;
}
