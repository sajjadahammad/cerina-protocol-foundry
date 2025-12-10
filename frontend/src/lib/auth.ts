import api from "@/lib/axios"
import type {
  LoginCredentials,
  RegisterCredentials,
  User,
  AuthResponse,
} from "@/types/auth"

// Re-export types for backward compatibility
export type {
  LoginCredentials,
  RegisterCredentials,
  User,
  AuthResponse,
} from "@/types/auth"

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const { data } = await api.post<AuthResponse>("/auth/login", credentials)
    return data
  },

  register: async (credentials: RegisterCredentials): Promise<AuthResponse> => {
    const { data } = await api.post<AuthResponse>("/auth/register", credentials)
    return data
  },

  logout: async (): Promise<void> => {
    await api.post("/auth/logout")
  },

  me: async (): Promise<User> => {
    const { data } = await api.get<User>("/auth/me")
    return data
  },
}
