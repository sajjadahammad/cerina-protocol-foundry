import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useLogin, useRegister, useLogout, useUser } from '../../src/hooks/use-auth'
import * as authApiModule from '../../src/lib/auth'
import * as authStoreModule from '../../src/stores/auth-store'

// Mock dependencies
vi.mock('../../src/lib/auth', () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
  },
}))

vi.mock('../../src/stores/auth-store', () => ({
  useAuthStore: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}))

const authApi = authApiModule.authApi
const useAuthStore = authStoreModule.useAuthStore

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return ({ children }: { children: React.ReactNode }) => {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('useLogin', () => {
  const mockLogin = vi.fn()
  const mockRouterPush = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuthStore).mockReturnValue({
      login: mockLogin,
      logout: vi.fn(),
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      setUser: vi.fn(),
      setToken: vi.fn(),
      setLoading: vi.fn(),
    } as any)

    vi.mocked(authApi.login).mockResolvedValue({
      user: { id: '1', email: 'test@example.com', name: 'Test User' },
      token: 'test-token',
    })
  })

  it('calls login API with credentials', async () => {
    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() })

    result.current.mutate({
      email: 'test@example.com',
      password: 'password123',
    })

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      })
    })
  })

  it('calls store login on success', async () => {
    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() })

    result.current.mutate({
      email: 'test@example.com',
      password: 'password123',
    })

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        { id: '1', email: 'test@example.com', name: 'Test User' },
        'test-token'
      )
    })
  })
})

describe('useRegister', () => {
  const mockLogin = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuthStore).mockReturnValue({
      login: mockLogin,
      logout: vi.fn(),
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      setUser: vi.fn(),
      setToken: vi.fn(),
      setLoading: vi.fn(),
    } as any)

    vi.mocked(authApi.register).mockResolvedValue({
      user: { id: '1', email: 'new@example.com', name: 'New User' },
      token: 'new-token',
    })
  })

  it('calls register API with credentials', async () => {
    const { result } = renderHook(() => useRegister(), { wrapper: createWrapper() })

    result.current.mutate({
      name: 'New User',
      email: 'new@example.com',
      password: 'password123',
    })

    await waitFor(() => {
      expect(authApi.register).toHaveBeenCalledWith({
        name: 'New User',
        email: 'new@example.com',
        password: 'password123',
      })
    })
  })

  it('calls store login on success', async () => {
    const { result } = renderHook(() => useRegister(), { wrapper: createWrapper() })

    result.current.mutate({
      name: 'New User',
      email: 'new@example.com',
      password: 'password123',
    })

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        { id: '1', email: 'new@example.com', name: 'New User' },
        'new-token'
      )
    })
  })
})

describe('useLogout', () => {
  const mockLogout = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuthStore).mockReturnValue({
      login: vi.fn(),
      logout: mockLogout,
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      setUser: vi.fn(),
      setToken: vi.fn(),
      setLoading: vi.fn(),
    } as any)

    vi.mocked(authApi.logout).mockResolvedValue()
  })

  it('calls logout API', async () => {
    const { result } = renderHook(() => useLogout(), { wrapper: createWrapper() })

    result.current.mutate()

    await waitFor(() => {
      expect(authApi.logout).toHaveBeenCalled()
    })
  })

  it('calls store logout on success', async () => {
    const { result } = renderHook(() => useLogout(), { wrapper: createWrapper() })

    result.current.mutate()

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled()
    })
  })

  it('calls store logout even on API error', async () => {
    vi.mocked(authApi.logout).mockRejectedValue(new Error('API Error'))

    const { result } = renderHook(() => useLogout(), { wrapper: createWrapper() })

    result.current.mutate()

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled()
    })
  })
})

describe('useUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authApi.me).mockResolvedValue({
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
    })
  })

  it('fetches user data when authenticated', async () => {
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: true,
      token: 'test-token',
      user: null,
      login: vi.fn(),
      logout: vi.fn(),
      isLoading: false,
      setUser: vi.fn(),
      setToken: vi.fn(),
      setLoading: vi.fn(),
    } as any)

    const { result } = renderHook(() => useUser(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(authApi.me).toHaveBeenCalled()
    expect(result.current.data).toEqual({
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
    })
  })

  it('does not fetch when not authenticated', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: false,
      token: null,
      user: null,
      login: vi.fn(),
      logout: vi.fn(),
      isLoading: false,
      setUser: vi.fn(),
      setToken: vi.fn(),
      setLoading: vi.fn(),
    } as any)

    renderHook(() => useUser(), { wrapper: createWrapper() })

    expect(authApi.me).not.toHaveBeenCalled()
  })
})

