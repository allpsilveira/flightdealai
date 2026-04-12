import { useSettingsStore } from "../stores/useSettings";

const LANGS = [
  { code: "en", flag: "🇺🇸" },
  { code: "es", flag: "🇪🇸" },
  { code: "pt", flag: "🇧🇷" },
];

export default function LanguageSwitcher() {
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);

  return (
    <div className="flex items-center gap-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5">
      {LANGS.map(({ code, flag }) => (
        <button
          key={code}
          onClick={() => setLanguage(code)}
          title={code.toUpperCase()}
          className={`px-2 py-1 rounded-md text-sm transition-all ${
            language === code
              ? "bg-white dark:bg-zinc-700 shadow-sm"
              : "opacity-40 hover:opacity-70"
          }`}
        >
          {flag}
        </button>
      ))}
    </div>
  );
}
