import axios from "axios"
import { toast } from "sonner"

// API base URL - matches backend API_V1_PREFIX
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
const API_PREFIX = "/api/v1"

export const api = axios.create({
  baseURL: `${API_BASE_URL}${API_PREFIX}`,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
})

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    // Get token from localStorage (client-side only)
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("auth_token")
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  },
)

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized - show message and redirect to login
      if (typeof window !== "undefined") {
        toast.error("Session Expired", {
          description: "Your session has expired. Please log in again.",
          duration: 3000,
        })
        
        // Wait a bit for the toast to be visible, then redirect
        setTimeout(() => {
          localStorage.removeItem("auth_token")
          window.location.href = "/login"
        }, 1500)
      }
    }
    return Promise.reject(error)
  },
)

export default api
