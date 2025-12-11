import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test-utils'
import userEvent from '@testing-library/user-event'
import { LoginForm } from '../../src/components/login-form'
import * as useAuthHook from '../../src/hooks/use-auth'

// Mock the useLogin hook
vi.mock('../../src/hooks/use-auth', () => ({
  useLogin: vi.fn(),
}))

describe('LoginForm', () => {
  const mockMutate = vi.fn()
  const mockUseLogin = vi.mocked(useAuthHook.useLogin)

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseLogin.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      data: undefined,
      reset: vi.fn(),
      mutateAsync: vi.fn(),
      status: 'idle',
    } as any)
  })

  it('renders login form with all fields', () => {
    render(<LoginForm />)

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.getByText(/welcome back/i)).toBeInTheDocument()
  })

  it('shows validation errors for empty fields', async () => {
    const user = userEvent.setup()
    render(<LoginForm />)

    const submitButton = screen.getByRole('button', { name: /sign in/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/email is required/i)).toBeInTheDocument()
      expect(screen.getByText(/password is required/i)).toBeInTheDocument()
    })
  })

  it('validates email format', async () => {
    const user = userEvent.setup()
    render(<LoginForm />)

    const emailInput = screen.getByLabelText(/email/i)
    await user.type(emailInput, 'invalid-email')
    await user.tab() // Trigger blur validation

    await waitFor(() => {
      expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument()
    })
  })

  it('submits form with valid credentials', async () => {
    const user = userEvent.setup()
    render(<LoginForm />)

    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    await user.type(emailInput, 'test@example.com')
    await user.type(passwordInput, 'password123')
    await user.click(submitButton)

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      })
    })
  })

  it('shows loading state when submitting', () => {
    mockUseLogin.mockReturnValue({
      mutate: mockMutate,
      isPending: true,
      isError: false,
      isSuccess: false,
      error: null,
      data: undefined,
      reset: vi.fn(),
      mutateAsync: vi.fn(),
      status: 'pending',
    } as any)

    render(<LoginForm />)

    expect(screen.getByText(/signing in/i)).toBeInTheDocument()
    const submitButton = screen.getByRole('button', { name: /signing in/i })
    expect(submitButton).toBeDisabled()
  })

  it('displays error message on login failure', () => {
    mockUseLogin.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      isError: true,
      isSuccess: false,
      error: { message: 'Invalid credentials' },
      data: undefined,
      reset: vi.fn(),
      mutateAsync: vi.fn(),
      status: 'error',
    } as any)

    render(<LoginForm />)

    expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument()
  })

  it('toggles password visibility', async () => {
    const user = userEvent.setup()
    render(<LoginForm />)

    const passwordInput = screen.getByLabelText(/password/i) as HTMLInputElement
    const toggleButton = screen.getByRole('button', { name: '' }) // Eye icon button

    expect(passwordInput.type).toBe('password')

    await user.click(toggleButton)

    expect(passwordInput.type).toBe('text')
  })

  it('has link to register page', () => {
    render(<LoginForm />)

    const registerLink = screen.getByRole('link', { name: /create account/i })
    expect(registerLink).toHaveAttribute('href', '/register')
  })
})

