export const THEME_STORAGE_KEY = "loginButtonThemeV1";

export const THEME_STOPS = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" }
];

export const THEME_ACCENTS = [
  { id: "gray", label: "Gray", tokenFamily: "gray" },
  { id: "brown", label: "Brown", tokenFamily: "brown" },
  { id: "red", label: "Red", tokenFamily: "red" },
  { id: "orange", label: "Orange", tokenFamily: "orange" },
  { id: "yellow", label: "Yellow", tokenFamily: "yellow" },
  { id: "chartreuse", label: "Chartreuse", tokenFamily: "chartreuse" },
  { id: "celery", label: "Celery", tokenFamily: "celery" },
  { id: "green", label: "Green", tokenFamily: "green" },
  { id: "seafoam", label: "Seafoam", tokenFamily: "seafoam" },
  { id: "cyan", label: "Cyan", tokenFamily: "cyan" },
  { id: "blue", label: "Blue", tokenFamily: "blue" },
  { id: "indigo", label: "Indigo", tokenFamily: "indigo" },
  { id: "purple", label: "Purple", tokenFamily: "purple" },
  { id: "fuchsia", label: "Fuchsia", tokenFamily: "fuchsia" },
  { id: "magenta", label: "Magenta", tokenFamily: "magenta" }
];

export const DEFAULT_THEME = {
  stop: "light",
  accent: "blue"
};

const THEME_STOP_IDS = new Set(THEME_STOPS.map((stop) => stop.id));
const THEME_ACCENT_IDS = new Set(THEME_ACCENTS.map((accent) => accent.id));

export function normalizeThemeStop(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return THEME_STOP_IDS.has(normalized) ? normalized : DEFAULT_THEME.stop;
}

export function normalizeThemeAccent(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return THEME_ACCENT_IDS.has(normalized) ? normalized : DEFAULT_THEME.accent;
}

export function normalizeThemePreference(value) {
  const candidate = value && typeof value === "object" ? value : {};
  return {
    stop: normalizeThemeStop(candidate.stop),
    accent: normalizeThemeAccent(candidate.accent)
  };
}

export function getThemeAccentMeta(accentId) {
  const normalized = normalizeThemeAccent(accentId);
  return THEME_ACCENTS.find((accent) => accent.id === normalized) || THEME_ACCENTS[0];
}

export function getThemeStopMeta(stopId) {
  const normalized = normalizeThemeStop(stopId);
  return THEME_STOPS.find((stop) => stop.id === normalized) || THEME_STOPS[0];
}
