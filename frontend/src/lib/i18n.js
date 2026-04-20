/**
 * Lightweight i18n — string lookup keyed by user language preference.
 * Falls back to English if a key is missing in a language.
 *
 * Usage:
 *   import { t } from "../lib/i18n";
 *   t("home.welcome")          // current language from useSettingsStore
 *   t("home.welcome", "pt")    // explicit language override
 *
 * Variables: t("greeting", { name: "Gabriel" }) → strings can use {{name}}.
 */
import { useSettingsStore } from "../stores/useSettings";

export const STRINGS = {
  // ── Common ───────────────────────────────────────────────────────────
  "common.loading":       { en: "Loading…",          es: "Cargando…",          pt: "Carregando…" },
  "common.save":          { en: "Save",              es: "Guardar",            pt: "Salvar" },
  "common.saved":         { en: "Saved ✓",          es: "Guardado ✓",         pt: "Salvo ✓" },
  "common.cancel":        { en: "Cancel",            es: "Cancelar",           pt: "Cancelar" },
  "common.delete":        { en: "Delete",            es: "Eliminar",           pt: "Excluir" },
  "common.edit":          { en: "Edit",              es: "Editar",             pt: "Editar" },
  "common.error":         { en: "Something went wrong.", es: "Algo salió mal.", pt: "Algo deu errado." },
  "common.retry":         { en: "Retry",             es: "Reintentar",         pt: "Tentar novamente" },

  // ── Home ─────────────────────────────────────────────────────────────
  "home.title":           { en: "My Routes",         es: "Mis Rutas",          pt: "Minhas Rotas" },
  "home.add_route":       { en: "+ Add Route",       es: "+ Añadir Ruta",      pt: "+ Adicionar Rota" },
  "home.no_routes":       { en: "No routes yet.",    es: "Sin rutas aún.",     pt: "Nenhuma rota ainda." },
  "home.last_scan":       { en: "Last scan",         es: "Último escaneo",     pt: "Última varredura" },

  // ── Route Detail ─────────────────────────────────────────────────────
  "route.scan_now":       { en: "Scan Now",          es: "Escanear ahora",     pt: "Verificar agora" },
  "route.price_chart":    { en: "Price History",     es: "Historial de precios", pt: "Histórico de preços" },
  "route.activity":       { en: "Activity",          es: "Actividad",          pt: "Atividade" },
  "route.events":         { en: "Events",            es: "Eventos",            pt: "Eventos" },
  "route.scans":          { en: "Scans",             es: "Escaneos",           pt: "Varreduras" },
  "route.cheapest_dates": { en: "Cheapest Dates",    es: "Fechas más baratas", pt: "Datas mais baratas" },
  "route.airlines":       { en: "Airlines",          es: "Aerolíneas",         pt: "Companhias aéreas" },
  "route.best_award":     { en: "Best Award",        es: "Mejor premio",       pt: "Melhor prêmio" },
  "route.intelligence":   { en: "Intelligence",      es: "Inteligencia",       pt: "Inteligência" },
  "route.ai_insight":     { en: "AI Insight",        es: "Análisis IA",        pt: "Análise IA" },

  // ── Actions ──────────────────────────────────────────────────────────
  "action.STRONG_BUY":    { en: "STRONG BUY",        es: "COMPRA FUERTE",      pt: "COMPRA FORTE" },
  "action.BUY":           { en: "BUY",               es: "COMPRAR",            pt: "COMPRAR" },
  "action.WATCH":         { en: "WATCH",             es: "OBSERVAR",           pt: "OBSERVAR" },
  "action.NORMAL":        { en: "NORMAL",            es: "NORMAL",             pt: "NORMAL" },
  "action.SKIP":          { en: "SKIP",              es: "OMITIR",             pt: "IGNORAR" },

  // ── Verdict ──────────────────────────────────────────────────────────
  "verdict.BUY_NOW":      { en: "Buy Now",           es: "Comprar ahora",      pt: "Comprar agora" },
  "verdict.URGENT":       { en: "Urgent",            es: "Urgente",            pt: "Urgente" },
  "verdict.WAIT":         { en: "Wait",              es: "Esperar",            pt: "Aguardar" },
  "verdict.MONITOR":      { en: "Monitor",           es: "Monitorear",         pt: "Monitorar" },

  // ── Cabin ────────────────────────────────────────────────────────────
  "cabin.business":        { en: "Business",         es: "Business",           pt: "Executiva" },
  "cabin.first":           { en: "First",            es: "Primera",            pt: "Primeira" },
  "cabin.premium_economy": { en: "Premium Economy",  es: "Premium Economy",    pt: "Premium Economy" },

  // ── Trends ───────────────────────────────────────────────────────────
  "trend.low":            { en: "Falling fast",      es: "Cayendo rápido",     pt: "Caindo rápido" },
  "trend.dropping":       { en: "Dropping",          es: "Bajando",            pt: "Caindo" },
  "trend.stable":         { en: "Stable",            es: "Estable",            pt: "Estável" },
  "trend.rising":         { en: "Rising",            es: "Subiendo",           pt: "Subindo" },
  "trend.spiking":        { en: "Spiking",           es: "Disparándose",       pt: "Disparando" },

  // ── Settings ─────────────────────────────────────────────────────────
  "settings.title":          { en: "Settings",          es: "Configuración",     pt: "Configurações" },
  "settings.account":        { en: "Account",           es: "Cuenta",            pt: "Conta" },
  "settings.notifications":  { en: "Notifications",     es: "Notificaciones",    pt: "Notificações" },
  "settings.display":        { en: "Display",           es: "Visualización",     pt: "Exibição" },
  "settings.api_usage":      { en: "API Usage",         es: "Uso de API",        pt: "Uso de API" },
  "settings.developer":      { en: "Developer",         es: "Desarrollador",     pt: "Desenvolvedor" },
  "settings.signout":        { en: "Sign out",          es: "Cerrar sesión",     pt: "Sair" },
};

/**
 * Resolve a string key to its translation in the given language.
 * Falls back to English, then to the key itself.
 */
export function t(key, varsOrLang, maybeLang) {
  // Disambiguate: t(key, "pt") vs t(key, {name: "x"}) vs t(key, {name: "x"}, "pt")
  let vars = null;
  let lang = null;
  if (typeof varsOrLang === "string") {
    lang = varsOrLang;
  } else if (varsOrLang && typeof varsOrLang === "object") {
    vars = varsOrLang;
    lang = maybeLang || null;
  }
  if (!lang) {
    try { lang = useSettingsStore.getState().language || "en"; }
    catch { lang = "en"; }
  }

  const entry = STRINGS[key];
  if (!entry) return key;
  let str = entry[lang] ?? entry.en ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`{{\\s*${k}\\s*}}`, "g"), String(v));
    }
  }
  return str;
}

/** React hook returning a `t` bound to the current language. */
export function useT() {
  const lang = useSettingsStore((s) => s.language) ?? "en";
  return (key, vars) => t(key, vars, lang);
}
