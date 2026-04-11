import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/useAuth";

export default function Login() {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [language, setLanguage] = useState("en");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password, language);
      }
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.detail ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-luxury-gradient flex items-center justify-center p-4">
      {/* Background accent */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] opacity-10 blur-3xl pointer-events-none"
        style={{ background: "radial-gradient(ellipse, #d4a843 0%, transparent 70%)" }}
      />

      <div className="w-full max-w-md animate-fade-in">
        {/* Brand */}
        <div className="text-center mb-10">
          <h1 className="font-serif text-4xl font-light tracking-wider text-white mb-2">
            Flight<span className="text-gold-500">Deal</span> AI
          </h1>
          <p className="text-sm text-white/40 font-sans tracking-widest uppercase">
            Luxury Travel Intelligence
          </p>
        </div>

        <div className="card p-8">
          {/* Tab switcher */}
          <div className="flex gap-1 mb-8 p-1 rounded-xl bg-navy-950/60">
            {["login", "register"].map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); }}
                className={`flex-1 py-2 rounded-lg text-sm font-sans font-medium transition-all duration-200 ${
                  mode === m
                    ? "bg-gold-500 text-navy-950"
                    : "text-white/40 hover:text-white/70"
                }`}
              >
                {m === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-sans text-white/50 mb-1.5 tracking-wider uppercase">
                Email
              </label>
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
              <label className="block text-xs font-sans text-white/50 mb-1.5 tracking-wider uppercase">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder={mode === "register" ? "Create a strong password" : "Your password"}
                required
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={mode === "register" ? 8 : undefined}
              />
            </div>

            {mode === "register" && (
              <div>
                <label className="block text-xs font-sans text-white/50 mb-1.5 tracking-wider uppercase">
                  Language
                </label>
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
              <p className="text-sm text-red-400 font-sans px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-3 mt-2"
            >
              {loading ? (
                <span className="animate-pulse">
                  {mode === "login" ? "Signing in…" : "Creating account…"}
                </span>
              ) : mode === "login" ? (
                "Sign In"
              ) : (
                "Create Account"
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-white/20 font-sans mt-6">
          Business · First · Premium Economy
        </p>
      </div>
    </div>
  );
}
