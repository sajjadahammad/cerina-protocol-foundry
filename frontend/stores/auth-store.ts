import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { User } from "@/lib/auth"

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  setUser: (user: User | null) => void
  setToken: (token: string | null) => void
  login: (user: User, token: string) => void
  logout: () => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setToken: (token) => {
        if (token) {
          localStorage.setItem("auth_token", token)
        } else {
          localStorage.removeItem("auth_token")
        }
        set({ token })
      },
      login: (user, token) => {
        localStorage.setItem("auth_token", token)
        set({ user, token, isAuthenticated: true, isLoading: false })
      },
      logout: () => {
        localStorage.removeItem("auth_token")
        set({ user: null, token: null, isAuthenticated: false })
      },
      setLoading: (isLoading) => set({ isLoading }),
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({ user: state.user, token: state.token, isAuthenticated: state.isAuthenticated }),
    },
  ),
)
