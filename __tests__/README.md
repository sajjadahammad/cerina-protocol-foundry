# Frontend Tests

All frontend tests are organized in this `__tests__` directory.

## Structure

```
__tests__/
├── components/          # Component tests
│   ├── login-form.test.tsx
│   └── register-form.test.tsx
├── hooks/               # Custom hook tests
│   └── use-auth.test.ts
├── lib/                 # Utility function tests
│   └── auth.test.ts
├── test-utils.tsx       # Test utilities and helpers
└── README.md            # This file
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

## Writing New Tests

1. Place test files in the appropriate subdirectory:
   - Component tests → `components/`
   - Hook tests → `hooks/`
   - Utility tests → `lib/`

2. Import from source files using relative paths:
   ```typescript
   import { ComponentName } from '../../src/components/component-name'
   ```

3. Use the test utilities from `test-utils.tsx`:
   ```typescript
   import { render, screen } from '../test-utils'
   ```

## Test Utilities

The `test-utils.tsx` file provides:
- Custom `render` function with all providers (QueryClient, ThemeProvider, etc.)
- Re-exports from `@testing-library/react`

