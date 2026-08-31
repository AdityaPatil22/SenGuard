import { create } from "zustand";

import { queryClient } from "@/lib/query-client";

interface AuthState {
  isAuthenticated: boolean;
  login: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: !!localStorage.getItem("access_token"),
  login: (accessToken, refreshToken) => {
    localStorage.setItem("access_token", accessToken);
    localStorage.setItem("refresh_token", refreshToken);
    set({ isAuthenticated: true });
  },
  logout: () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    queryClient.cancelQueries();
    queryClient.clear();
    set({ isAuthenticated: false });
  },
}));
