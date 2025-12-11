import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../test-utils'
import userEvent from '@testing-library/user-event'
import { RegisterForm } from '../../src/components/register-form'
import * as useAuthHook from '../../src/hooks/use-auth'

// Mock the useRegister hook
vi.mock('../../src/hooks/use-auth', () => ({
  useRegister: vi.fn(),
}))

describe('RegisterForm', () => {
  const mockMutate = vi.fn()
  const mockUseRegister = vi.mocked(useAuthHook.useRegister)

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseRegister.mockReturnValue({
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

  it('renders registration form with all fields', () => {
    render(<RegisterForm />)

    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
  })

  it('validates name length', async () => {
    const user = userEvent.setup()
    render(<RegisterForm />)

    const nameInput = screen.getByLabelText(/full name/i)
    await user.type(nameInput, 'A')
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText(/name must be at least 2 characters/i)).toBeInTheDocument()
    })
  })

  it('validates email format', async () => {
    const user = userEvent.setup()
    render(<RegisterForm />)

    const emailInput = screen.getByLabelText(/email/i)
    await user.type(emailInput, 'invalid-email')
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText(/please enter a valid email address/i)).toBeInTheDocument()
    })
  })

  it('validates password requirements', async () => {
    const user = userEvent.setup()
    render(<RegisterForm />)

    const passwordInput = screen.getByLabelText(/^password$/i)
    
    // Test too short password
    await user.type(passwordInput, 'short')
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument()
    })

    // Test password without uppercase
    await user.clear(passwordInput)
    await user.type(passwordInput, 'lowercase123')
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText(/password must contain at least one uppercase letter/i)).toBeInTheDocument()
    })

    // Test password without lowercase
    await user.clear(passwordInput)
    await user.type(passwordInput, 'UPPERCASE123')
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText(/password must contain at least one lowercase letter/i)).toBeInTheDocument()
    })

    // Test password without number
    await user.clear(passwordInput)
    await user.type(passwordInput, 'NoNumberHere')
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText(/password must contain at least one number/i)).toBeInTheDocument()
    })
  })

  it('validates password confirmation match', async () => {
    const user = userEvent.setup()
    render(<RegisterForm />)

    const passwordInput = screen.getByLabelText(/^password$/i)
    const confirmPasswordInput = screen.getByLabelText(/confirm password/i)

    await user.type(passwordInput, 'ValidPass123')
    await user.type(confirmPasswordInput, 'DifferentPass123')
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument()
    })
  })

  it('submits form with valid data', async () => {
    const user = userEvent.setup()
    render(<RegisterForm />)

    await user.type(screen.getByLabelText(/full name/i), 'John Doe')
    await user.type(screen.getByLabelText(/email/i), 'john@example.com')
    await user.type(screen.getByLabelText(/^password$/i), 'ValidPass123')
    await user.type(screen.getByLabelText(/confirm password/i), 'ValidPass123')
    
    const submitButton = screen.getByRole('button', { name: /create account/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'ValidPass123',
      })
    })
  })

  it('shows loading state when submitting', () => {
    mockUseRegister.mockReturnValue({
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

    render(<RegisterForm />)

    expect(screen.getByText(/creating account/i)).toBeInTheDocument()
    const submitButton = screen.getByRole('button', { name: /creating account/i })
    expect(submitButton).toBeDisabled()
  })

  it('displays error message on registration failure', () => {
    mockUseRegister.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      isError: true,
      isSuccess: false,
      error: { message: 'Registration failed' },
      data: undefined,
      reset: vi.fn(),
      mutateAsync: vi.fn(),
      status: 'error',
    } as any)

    render(<RegisterForm />)

    expect(screen.getByText(/registration failed/i)).toBeInTheDocument()
  })

  it('has link to login page', () => {
    render(<RegisterForm />)

    const loginLink = screen.getByRole('link', { name: /sign in/i })
    expect(loginLink).toHaveAttribute('href', '/login')
  })
})

