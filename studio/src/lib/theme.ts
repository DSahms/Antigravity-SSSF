/**
 * Theme store — light / dark flip with persistence.
 * Keeps `data-theme` on <html> so CSS variables cascade.
 */
import { ref, watch } from "vue";

export type Theme = "light" | "dark";

const STORAGE_KEY = "crew.theme";

function initial(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  // Default: dark (the owner stares at this for hours; warm dark is the calm choice)
  return "dark";
}

export const theme = ref<Theme>(initial());

function applyTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
  document.documentElement.style.colorScheme = t;
}
applyTheme(theme.value);

watch(theme, (t) => {
  applyTheme(t);
  localStorage.setItem(STORAGE_KEY, t);
});

export function toggleTheme() {
  theme.value = theme.value === "dark" ? "light" : "dark";
}
