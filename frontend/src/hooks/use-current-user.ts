import { useQuery } from "@tanstack/react-query";

import api from "@/services/api";
import { useAuthStore } from "@/store/auth";
import type { ApiResponse, User } from "@/types/api";

export function useCurrentUser() {
  const { isAuthenticated } = useAuthStore();
  return useQuery({
    queryKey: ["currentUser"],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<User>>("/auth/me");
      return data.data;
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUserRole() {
  const { data: user } = useCurrentUser();
  return user?.role ?? "developer";
}

export function useCanReview() {
  const role = useUserRole();
  return role === "reviewer" || role === "admin";
}
