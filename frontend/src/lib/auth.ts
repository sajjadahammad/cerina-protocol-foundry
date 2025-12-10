import api from "@/lib/axios"

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterCredentials {
  name: string
  email: string
  password: string
}

export interface User {
  id: string
  name: string
  email: string
  avatar?: string
}

export interface AuthResponse {
  user: User
  token: string
}

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
