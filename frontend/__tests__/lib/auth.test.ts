import { describe, it, expect, vi, beforeEach } from 'vitest'
import { authApi } from '../../src/lib/auth'
import * as axiosModule from '../../src/lib/axios'

// Mock axios
vi.mock('../../src/lib/axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}))

const api = axiosModule.default

describe('authApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('login', () => {
    it('calls API with correct endpoint and credentials', async () => {
      const mockResponse = {
        data: {
          user: { id: '1', email: 'test@example.com', name: 'Test User' },
          token: 'test-token',
        },
      }

      vi.mocked(api.post).mockResolvedValue(mockResponse)

      const result = await authApi.login({
        email: 'test@example.com',
        password: 'password123',
      })

      expect(api.post).toHaveBeenCalledWith('/auth/login', {
        email: 'test@example.com',
        password: 'password123',
      })
      expect(result).toEqual(mockResponse.data)
    })
  })

  describe('register', () => {
    it('calls API with correct endpoint and credentials', async () => {
      const mockResponse = {
        data: {
          user: { id: '1', email: 'new@example.com', name: 'New User' },
          token: 'new-token',
        },
      }

      vi.mocked(api.post).mockResolvedValue(mockResponse)

      const result = await authApi.register({
        name: 'New User',
        email: 'new@example.com',
        password: 'password123',
      })

      expect(api.post).toHaveBeenCalledWith('/auth/register', {
        name: 'New User',
        email: 'new@example.com',
        password: 'password123',
      })
      expect(result).toEqual(mockResponse.data)
    })
  })

  describe('logout', () => {
    it('calls API with correct endpoint', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: undefined })

      await authApi.logout()

      expect(api.post).toHaveBeenCalledWith('/auth/logout')
    })
  })

  describe('me', () => {
    it('calls API with correct endpoint and returns user', async () => {
      const mockResponse = {
        data: { id: '1', email: 'test@example.com', name: 'Test User' },
      }

      vi.mocked(api.get).mockResolvedValue(mockResponse)

      const result = await authApi.me()

      expect(api.get).toHaveBeenCalledWith('/auth/me')
      expect(result).toEqual(mockResponse.data)
    })
  })
})

