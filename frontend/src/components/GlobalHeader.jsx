import { NavLink, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/useAuth";
import { useDarkMode } from "../hooks/useDarkMode";
import LanguageSwitcher from "./LanguageSwitcher";
import clsx from "clsx";

export default function GlobalHeader() {
  const user     = useAuthStore((s) => s.user);
  const logout   = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [dark, setDark] = useDarkMode();

  const handleLogout = () => { logout(); navigate("/login"); };

  return (
    <header className="h-14 flex items-center justify-between px-6 flex-shrink-0
                       bg-white dark:bg-zinc-900
                       border-b border-zinc-200 dark:border-zinc-800
                       sticky top-0 z-40">
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-md bg-brand-500 flex items-center justify-center flex-shrink-0">
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path d="M2 10L7 2L12 10" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="7" cy="11.5" r="1.5" fill="white"/>
          </svg>
        </div>
        <span className="text-sm font-semibold text-zinc-900 dark:text-white tracking-tight">
          FlyLuxury<span className="text-brand-500">Deals</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex items-center gap-1">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            clsx(
              "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
              isActive
                ? "bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            )
          }
        >
          Home
        </NavLink>
        <NavLink
          to="/saved"
          className={({ isActive }) =>
            clsx(
              "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
              isActive
                ? "bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            )
          }
        >
          Saved
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            clsx(
              "px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
              isActive
                ? "bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            )
          }
        >
          Settings
        </NavLink>
      </nav>

      {/* Right: lang + dark mode + user */}
      <div className="flex items-center gap-3">
        <LanguageSwitcher />

        <button
          onClick={() => setDark(!dark)}
          title={dark ? "Light mode" : "Dark mode"}
          className="p-1.5 rounded-lg text-zinc-400 dark:text-zinc-500
                     hover:text-zinc-700 dark:hover:text-zinc-200
                     hover:bg-zinc-100 dark:hover:bg-zinc-800
                     transition-all"
        >
          {dark ? <IconSun /> : <IconMoon />}
        </button>

        <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-700" />

        <div className="text-right">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-[160px] truncate">
            {user?.email}
          </p>
          <button
            onClick={handleLogout}
            className="text-2xs text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

function IconSun() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="2.5"/>
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"/>
    </svg>
  );
}

function IconMoon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M13.5 9A6 6 0 0 1 7 2.5a6 6 0 1 0 6.5 6.5z"/>
    </svg>
  );
}
