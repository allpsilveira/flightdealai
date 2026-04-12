import { useState } from "react";
import { useRoutesStore } from "../stores/useRoutes";
import allAirports from "../data/airports.json";

const AIRPORT_CODES = [
  "MIA", "MCO", "FLL", "TPA", "JFK", "EWR", "LAX", "ORD", "DFW", "ATL",
  "GRU", "CNF", "BSB", "REC", "FOR", "SSA", "CWB", "POA", "GIG", "SDU",
];

const AIRPORT_MAP = Object.fromEntries(allAirports.map((a) => [a.iata, a]));

const CABINS = [
  { value: "BUSINESS",        label: "Business" },
  { value: "FIRST",           label: "First Class" },
  { value: "PREMIUM_ECONOMY", label: "Premium Economy" },
];

const TRIP_TYPES = [
  { value: "ONE_WAY",    label: "One-way",        desc: "Single direction only" },
  { value: "ROUND_TRIP", label: "Round trip",     desc: "Outbound + return on same route" },
  { value: "MONITOR",    label: "Monitor both ★", desc: "Outbound + return tracked separately (recommended)" },
];

const DRIVE_OPTIONS = [
  { value: 0,   label: "No driving",          desc: "Fly only from selected airports", radius: null },
  { value: 1,   label: "Up to 1 hour",         desc: "~80 km radius — nearby cities",   radius: "~80 km" },
  { value: 2,   label: "Up to 2 hours ★",      desc: "~150 km radius — recommended",    radius: "~150 km" },
  { value: 3,   label: "Up to 3 hours",         desc: "~230 km radius — wider region",   radius: "~230 km" },
  { value: 4,   label: "Up to 4 hours",         desc: "~300 km radius — large metro area", radius: "~300 km" },
];

const STEPS = ["Origins", "Destinations", "Trip Type", "Cabin", "Drive Range", "Dates"];

const EMPTY = {
  name: "",
  origins: [],
  destinations: [],
  trip_type: "MONITOR",
  cabin_classes: [],
  max_drive_hours: 2,
  date_from: "",
  date_to: "",
};

function AirportRow({ code, selected, onClick }) {
  const ap = AIRPORT_MAP[code];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${
        selected
          ? "bg-brand-50 dark:bg-brand-500/10 border-brand-300 dark:border-brand-500/40"
          : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 hover:border-brand-200 dark:hover:border-brand-600/40"
      }`}
    >
      <span className={`text-sm font-bold tabular-nums w-10 flex-shrink-0 ${
        selected ? "text-brand-600 dark:text-brand-400" : "text-zinc-900 dark:text-white"
      }`}>
        {code}
      </span>
      <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
        {ap ? `${ap.city}, ${ap.country}` : "—"}
      </span>
      {selected && (
        <span className="ml-auto text-brand-500 text-xs font-bold flex-shrink-0">✓</span>
      )}
    </button>
  );
}

export default function AddRouteModal({ onClose }) {
  const createRoute = useRoutesStore((s) => s.createRoute);
  const [step, setStep]     = useState(0);
  const [form, setForm]     = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const toggle = (key, value) =>
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(value)
        ? f[key].filter((x) => x !== value)
        : [...f[key], value],
    }));

  const canAdvance = () => {
    if (step === 0) return form.origins.length > 0;
    if (step === 1) return form.destinations.length > 0;
    if (step === 2) return !!form.trip_type;
    if (step === 3) return form.cabin_classes.length > 0;
    if (step === 4) return form.max_drive_hours != null;
    if (step === 5) return form.date_from && form.date_to;
    return true;
  };

  const handleSubmit = async () => {
    setSaving(true); setError("");
    const name = form.name.trim() ||
      `${form.origins.join("/")} → ${form.destinations.join("/")}`;
    try {
      await createRoute({
        ...form,
        name,
        max_drive_hours: form.max_drive_hours > 0 ? form.max_drive_hours : null,
      });
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail ?? "Failed to create route.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center
                 bg-black/50 dark:bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl
                   overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
              Add Route
            </h2>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full
                         bg-zinc-100 dark:bg-zinc-800 text-zinc-500
                         hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-sm"
            >
              ✕
            </button>
          </div>

          {/* Step indicators */}
          <div className="flex items-center gap-1">
            {STEPS.map((_l, i) => (
              <div key={i} className="flex-1">
                <div className={`h-1 rounded-full transition-all ${
                  i <= step ? "bg-brand-500" : "bg-zinc-200 dark:bg-zinc-700"
                }`} />
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
            Step {step + 1} of {STEPS.length} — {STEPS[step]}
          </p>
        </div>

        {/* Step content */}
        <div className="px-6 pb-6 min-h-[220px]">

          {/* Step 0: Origins */}
          {step === 0 && (
            <div>
              <p className="text-sm text-zinc-600 dark:text-zinc-300 mb-3">
                Select your primary departure airport(s)
              </p>
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {AIRPORT_CODES.map((a) => (
                  <AirportRow key={a} code={a}
                    selected={form.origins.includes(a)}
                    onClick={() => toggle("origins", a)} />
                ))}
              </div>
              {form.origins.length > 0 && (
                <p className="text-xs text-brand-500 mt-3 font-medium">
                  Selected: {form.origins.join(", ")}
                </p>
              )}
            </div>
          )}

          {/* Step 1: Destinations */}
          {step === 1 && (
            <div>
              <p className="text-sm text-zinc-600 dark:text-zinc-300 mb-3">
                Select destination airport(s)
              </p>
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {AIRPORT_CODES.map((a) => (
                  <AirportRow key={a} code={a}
                    selected={form.destinations.includes(a)}
                    onClick={() => toggle("destinations", a)} />
                ))}
              </div>
              {form.destinations.length > 0 && (
                <p className="text-xs text-brand-500 mt-3 font-medium">
                  Selected: {form.destinations.join(", ")}
                </p>
              )}
            </div>
          )}

          {/* Step 2: Trip type */}
          {step === 2 && (
            <div className="space-y-2.5">
              {TRIP_TYPES.map(({ value, label, desc }) => (
                <button key={value} type="button"
                  onClick={() => setForm((f) => ({ ...f, trip_type: value }))}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                    form.trip_type === value
                      ? "bg-brand-50 dark:bg-brand-500/10 border-brand-300 dark:border-brand-500/40"
                      : "bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:border-brand-200"
                  }`}
                >
                  <p className={`text-sm font-medium ${
                    form.trip_type === value ? "text-brand-700 dark:text-brand-300" : "text-zinc-900 dark:text-white"
                  }`}>{label}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{desc}</p>
                </button>
              ))}
            </div>
          )}

          {/* Step 3: Cabin */}
          {step === 3 && (
            <div className="space-y-2.5">
              {CABINS.map(({ value, label }) => (
                <button key={value} type="button"
                  onClick={() => toggle("cabin_classes", value)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                    form.cabin_classes.includes(value)
                      ? "bg-brand-50 dark:bg-brand-500/10 border-brand-300 dark:border-brand-500/40"
                      : "bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:border-brand-200"
                  }`}
                >
                  <p className={`text-sm font-medium ${
                    form.cabin_classes.includes(value) ? "text-brand-700 dark:text-brand-300" : "text-zinc-900 dark:text-white"
                  }`}>{label}</p>
                </button>
              ))}
            </div>
          )}

          {/* Step 4: Drive range */}
          {step === 4 && (
            <div>
              <p className="text-sm text-zinc-600 dark:text-zinc-300 mb-1">
                How far are you willing to drive to pay less?
              </p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-3 leading-snug">
                We'll automatically check nearby airports within your drive range and alert you when they're cheaper to the same destination.
              </p>
              <div className="space-y-2">
                {DRIVE_OPTIONS.map(({ value, label, desc, radius }) => (
                  <button key={value} type="button"
                    onClick={() => setForm((f) => ({ ...f, max_drive_hours: value }))}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                      form.max_drive_hours === value
                        ? "bg-brand-50 dark:bg-brand-500/10 border-brand-300 dark:border-brand-500/40"
                        : "bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:border-brand-200"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className={`text-sm font-medium ${
                        form.max_drive_hours === value ? "text-brand-700 dark:text-brand-300" : "text-zinc-900 dark:text-white"
                      }`}>{label}</p>
                      {radius && (
                        <span className="text-xs text-zinc-400 tabular-nums">{radius}</span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">{desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 5: Dates */}
          {step === 5 && (
            <div className="space-y-4">
              <div>
                <label className="label block mb-1.5">Date From</label>
                <input type="date" className="input" value={form.date_from}
                  onChange={(e) => setForm((f) => ({ ...f, date_from: e.target.value }))} />
              </div>
              <div>
                <label className="label block mb-1.5">Date To</label>
                <input type="date" className="input" value={form.date_to}
                  onChange={(e) => setForm((f) => ({ ...f, date_to: e.target.value }))} />
              </div>
              <div>
                <label className="label block mb-1.5">Route Name (optional)</label>
                <input type="text" className="input"
                  placeholder={`${form.origins.join("/")} → ${form.destinations.join("/")}`}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>

              {/* Summary */}
              <div className="px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 space-y-1">
                <p className="text-xs font-semibold text-zinc-900 dark:text-white mb-2">Summary</p>
                {[
                  ["From",   form.origins.join(", ")],
                  ["To",     form.destinations.join(", ")],
                  ["Cabin",  form.cabin_classes.map(c => CABINS.find(x => x.value === c)?.label).join(", ")],
                  ["Type",   TRIP_TYPES.find(t => t.value === form.trip_type)?.label],
                  ["Drive",  DRIVE_OPTIONS.find(d => d.value === form.max_drive_hours)?.label],
                ].map(([label, val]) => val ? (
                  <p key={label} className="text-xs text-zinc-500 dark:text-zinc-400">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}:</span>{" "}{val}
                  </p>
                ) : null)}
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 px-3 py-2 rounded-xl mt-3
                          bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
              {error}
            </p>
          )}
        </div>

        {/* Footer nav */}
        <div className="px-6 pb-6 flex items-center justify-between gap-3">
          <button type="button"
            onClick={() => step === 0 ? onClose() : setStep((s) => s - 1)}
            className="btn-ghost">
            {step === 0 ? "Cancel" : "← Back"}
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={() => setStep((s) => s + 1)}
              disabled={!canAdvance()} className="btn-primary disabled:opacity-40">
              Next →
            </button>
          ) : (
            <button type="button" onClick={handleSubmit}
              disabled={saving || !canAdvance()} className="btn-primary disabled:opacity-40">
              {saving ? "Creating…" : "Start Monitoring"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
