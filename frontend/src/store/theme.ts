import { create } from "zustand";

type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  toggle: () => void;
}

const storedTheme = (localStorage.getItem("theme") as Theme) || "light";
document.documentElement.classList.toggle("dark", storedTheme === "dark");

export const useThemeStore = create<ThemeState>((set) => ({
  theme: storedTheme,
  toggle: () =>
    set((state) => {
      const next = state.theme === "light" ? "dark" : "light";
      localStorage.setItem("theme", next);
      document.documentElement.classList.toggle("dark", next === "dark");
      return { theme: next };
    }),
}));
