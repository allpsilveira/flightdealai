import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/useAuth";
import clsx from "clsx";

const NAV = [
  { to: "/",         label: "Deal Feed",        icon: "✦" },
  { to: "/routes",   label: "Routes",            icon: "◈" },
  { to: "/prices",   label: "Price History",     icon: "◇" },
  { to: "/airports", label: "Airport Compare",   icon: "◉" },
  { to: "/alerts",   label: "Alerts",            icon: "◎" },
  { to: "/settings", label: "Settings",          icon: "⊙" },
];

export default function Layout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen">
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="w-64 flex-shrink-0 flex flex-col bg-navy-900 border-r border-surface-border">
        {/* Logo */}
        <div className="px-6 pt-8 pb-6">
          <h1 className="font-serif text-2xl font-light tracking-wider text-white">
            Flight<span className="text-gold-500">Deal</span>
          </h1>
          <p className="text-xs text-white/30 font-sans mt-0.5 tracking-widest uppercase">
            AI Intelligence
          </p>
        </div>

        <div className="gold-rule mx-6 mb-6" />

        {/* Nav links */}
        <nav className="flex-1 px-3 space-y-1">
          {NAV.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-sans font-medium transition-all duration-150",
                  isActive
                    ? "bg-gold-500/15 text-gold-400 border border-gold-500/20"
                    : "text-white/50 hover:text-white/80 hover:bg-surface-hover"
                )
              }
            >
              <span className="text-base">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="px-4 pb-6 pt-4 border-t border-surface-border">
          <p className="text-xs text-white/30 font-sans truncate mb-2">{user?.email}</p>
          <button onClick={handleLogout} className="btn-ghost w-full justify-center text-xs py-2">
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
