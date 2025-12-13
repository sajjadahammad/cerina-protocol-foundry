"use client"

import type React from "react"

import { useEffect } from "react"
import { useAuthStore } from "@/stores/auth-store"
import { authApi } from "@/lib/auth"

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { token, setUser, setLoading, logout } = useAuthStore()

  useEffect(() => {
    const checkAuth = async () => {
      if (token) {
        try {
          const user = await authApi.me()
          setUser(user)
        } catch {
          logout()
        }
      }
      setLoading(false)
    }

    checkAuth()
  }, [token, setUser, setLoading, logout])

  return <>{children}</>
}
