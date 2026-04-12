import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/useAuth";
import { useDarkMode } from "../hooks/useDarkMode";

export default function Login() {
  const [mode, setMode]         = useState("login");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [language, setLanguage] = useState("en");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [dark, setDark]         = useDarkMode();

  const login    = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password, language);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.detail ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-sand-50 dark:bg-zinc-950 flex items-center justify-center p-4">

      {/* Dark mode toggle — top right */}
      <button
        onClick={() => setDark(!dark)}
        className="fixed top-5 right-5 btn-icon"
        aria-label="Toggle dark mode"
      >
        {dark
          ? <SunIcon />
          : <MoonIcon />
        }
      </button>

      <div className="w-full max-w-sm animate-fade-in">

        {/* Brand mark */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-brand-500 shadow-brand mb-4">
            <svg width="22" height="22" viewBox="0 0 14 14" fill="none">
              <path d="M2 10L7 2L12 10" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="7" cy="11.5" r="1.5" fill="white"/>
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-white tracking-tight">
            FlyLuxury<span className="text-brand-500">Deals</span>
          </h1>
          <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">
            Business &amp; First Class intelligence
          </p>
        </div>

        {/* Card */}
        <div className="card p-6">

          {/* Tab switcher */}
          <div className="flex gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 mb-5">
            {["login", "register"].map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); }}
                className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  mode === m
                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
              >
                {m === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="label block mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="label block mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder={mode === "register" ? "8+ characters" : "Your password"}
                required
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={mode === "register" ? 8 : undefined}
              />
            </div>

            {mode === "register" && (
              <div>
                <label className="label block mb-1.5">Language</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="input"
                >
                  <option value="en">English</option>
                  <option value="pt">Português</option>
                </select>
              </div>
            )}

            {error && (
              <p className="text-xs text-red-600 dark:text-red-400 px-3 py-2.5 rounded-xl
                            bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-2.5 mt-1"
            >
              {loading
                ? (mode === "login" ? "Signing in…" : "Creating account…")
                : (mode === "login" ? "Sign In" : "Create Account")
              }
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-zinc-400 dark:text-zinc-600 mt-5">
          Business · First · Premium Economy
        </p>
      </div>
    </div>
  );
}

function SunIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="2.5"/>
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"/>
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M13.5 9A6 6 0 0 1 7 2.5a6 6 0 1 0 6.5 6.5z"/>
    </svg>
  );
}
