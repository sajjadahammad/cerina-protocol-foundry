"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { authApi, type LoginCredentials, type RegisterCredentials } from "@/lib/auth"
import { useAuthStore } from "@/stores/auth-store"
import { useRouter } from "next/navigation"

export function useLogin() {
  const { login } = useAuthStore()
  const router = useRouter()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (credentials: LoginCredentials) => authApi.login(credentials),
    onSuccess: (data) => {
      login(data.user, data.token)
      queryClient.invalidateQueries({ queryKey: ["user"] })
      router.push("/dashboard")
    },
  })
}

export function useRegister() {
  const { login } = useAuthStore()
  const router = useRouter()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (credentials: RegisterCredentials) => authApi.register(credentials),
    onSuccess: (data) => {
      login(data.user, data.token)
      queryClient.invalidateQueries({ queryKey: ["user"] })
      router.push("/dashboard")
    },
  })
}

export function useLogout() {
  const { logout } = useAuthStore()
  const router = useRouter()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      logout()
      queryClient.clear()
      router.push("/login")
    },
    onError: () => {
      // Even if API fails, clear local state
      logout()
      queryClient.clear()
      router.push("/login")
    },
  })
}

export function useUser() {
  const { isAuthenticated, token } = useAuthStore()

  return useQuery({
    queryKey: ["user"],
    queryFn: () => authApi.me(),
    enabled: isAuthenticated && !!token,
    retry: false,
  })
}
