import { test, expect } from '@playwright/test'
import {
  mockPasswordLogin,
  mockPasswordLoginFailure,
  mockGuestLogin,
  mockSendEmailOtp,
  mockVerifyEmailOtp,
  mockChatApis,
  seedAuth,
} from '../helpers/api-mocks.js'

test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  // ── Page structure ────────────────────────────────────────────────────────

  test('renders the login page with all key elements', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByText('Choose how you want to sign in')).toBeVisible()

    // OAuth buttons
    await expect(page.getByRole('button', { name: /Google/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /GitHub/i })).toBeVisible()

    // Method tabs
    await expect(page.getByRole('button', { name: /Email/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Phone/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Password/i })).toBeVisible()

    // Guest and register links
    await expect(page.getByRole('button', { name: /Continue as Guest/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Create one/i })).toBeVisible()
  })

  test('shows password method by default', async ({ page }) => {
    await expect(page.getByPlaceholder('jane_doe or you@example.com')).toBeVisible()
    await expect(page.getByPlaceholder('Your password')).toBeVisible()
    await expect(page.getByRole('link', { name: /Forgot password/i })).toBeVisible()
  })

  test('navigates to register page via Create one link', async ({ page }) => {
    await page.getByRole('link', { name: /Create one/i }).click()
    await expect(page).toHaveURL('/register')
  })

  test('navigates to forgot password page', async ({ page }) => {
    await page.getByRole('link', { name: /Forgot password/i }).click()
    await expect(page).toHaveURL('/forgot-password')
  })

  // ── Already-authenticated redirect ───────────────────────────────────────

  test('redirects authenticated user away from login', async ({ page }) => {
    await seedAuth(page)
    await mockChatApis(page)
    await page.goto('/login')
    await expect(page).toHaveURL(/\/chat/)
  })

  // ── Password login ────────────────────────────────────────────────────────

  test('signs in with username and password successfully', async ({ page }) => {
    await mockPasswordLogin(page)
    await mockChatApis(page)

    await page.getByPlaceholder('jane_doe or you@example.com').fill('jane_doe')
    await page.getByPlaceholder('Your password').fill('SecurePass1!')
    await page.getByRole('button', { name: /^Sign in$/ }).click()

    await expect(page).toHaveURL(/\/chat/)
  })

  test('signs in with email and password successfully', async ({ page }) => {
    await mockPasswordLogin(page)
    await mockChatApis(page)

    await page.getByPlaceholder('jane_doe or you@example.com').fill('jane@example.com')
    await page.getByPlaceholder('Your password').fill('SecurePass1!')
    await page.getByRole('button', { name: /^Sign in$/ }).click()

    await expect(page).toHaveURL(/\/chat/)
  })

  test('shows error on wrong credentials', async ({ page }) => {
    await mockPasswordLoginFailure(page, 'Invalid credentials')

    await page.getByPlaceholder('jane_doe or you@example.com').fill('jane_doe')
    await page.getByPlaceholder('Your password').fill('WrongPassword')
    await page.getByRole('button', { name: /^Sign in$/ }).click()

    await expect(page.locator('.error-text')).toContainText('Invalid credentials')
  })

  test('requires identifier to be filled before submitting', async ({ page }) => {
    await page.getByPlaceholder('Your password').fill('somepassword')
    await page.getByRole('button', { name: /^Sign in$/ }).click()

    await expect(page.locator('.error-text')).toContainText(/username or email/i)
  })

  test('requires password to be filled before submitting', async ({ page }) => {
    await page.getByPlaceholder('jane_doe or you@example.com').fill('jane_doe')
    await page.getByRole('button', { name: /^Sign in$/ }).click()

    await expect(page.locator('.error-text')).toContainText(/password/i)
  })

  test('toggles password visibility', async ({ page }) => {
    const passwordInput = page.getByPlaceholder('Your password')
    await expect(passwordInput).toHaveAttribute('type', 'password')

    // Click the eye icon button
    await page.locator('.pw-toggle-btn').click()
    await expect(passwordInput).toHaveAttribute('type', 'text')

    await page.locator('.pw-toggle-btn').click()
    await expect(passwordInput).toHaveAttribute('type', 'password')
  })

  test('submit button shows loading state during sign in', async ({ page }) => {
    // Delay the response so we can catch the loading state
    await page.route('**/api/v1/auth/login', async (route) => {
      await new Promise(r => setTimeout(r, 300))
      route.fulfill({ json: { accessToken: 'tok', refreshToken: 'ref', user: {} } })
    })
    await mockChatApis(page)

    await page.getByPlaceholder('jane_doe or you@example.com').fill('jane_doe')
    await page.getByPlaceholder('Your password').fill('SecurePass1!')

    const btn = page.getByRole('button', { name: /^Sign in$/ })
    await btn.click()
    await expect(page.getByText('Signing in…')).toBeVisible()
  })

  // ── Email OTP method ──────────────────────────────────────────────────────

  test('switches to Email OTP method', async ({ page }) => {
    await page.getByRole('button', { name: /^Email$/i }).click()
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible()
    await expect(page.getByRole('button', { name: /Send code/i })).toBeVisible()
  })

  test('sends email OTP and shows code input', async ({ page }) => {
    await mockSendEmailOtp(page)

    await page.getByRole('button', { name: /^Email$/i }).click()
    await page.getByPlaceholder('you@example.com').fill('jane@example.com')
    await page.getByRole('button', { name: /Send code/i }).click()

    await expect(page.getByText('Enter verification code')).toBeVisible()
  })

  test('disables Send code button during cooldown', async ({ page }) => {
    await mockSendEmailOtp(page)

    await page.getByRole('button', { name: /^Email$/i }).click()
    await page.getByPlaceholder('you@example.com').fill('jane@example.com')
    await page.getByRole('button', { name: /Send code/i }).click()

    // Button should show countdown and be disabled
    await expect(page.getByRole('button', { name: /\d+s/ })).toBeDisabled()
  })

  test('shows validation error for invalid email in Email OTP method', async ({ page }) => {
    await page.getByRole('button', { name: /^Email$/i }).click()
    await page.getByPlaceholder('you@example.com').fill('not-an-email')
    await page.getByRole('button', { name: /Send code/i }).click()

    await expect(page.locator('.error-text')).toBeVisible()
  })

  test('verifies email OTP and navigates to chat', async ({ page }) => {
    await mockSendEmailOtp(page)
    await mockVerifyEmailOtp(page)
    await mockChatApis(page)

    await page.getByRole('button', { name: /^Email$/i }).click()
    await page.getByPlaceholder('you@example.com').fill('jane@example.com')
    await page.getByRole('button', { name: /Send code/i }).click()

    // Fill OTP boxes (6 individual inputs)
    const otpInputs = page.locator('.otp-input-box, input[maxlength="1"]')
    for (let i = 0; i < 6; i++) {
      await otpInputs.nth(i).fill(String(i + 1))
    }

    await expect(page).toHaveURL(/\/chat/)
  })

  // ── Phone OTP method ──────────────────────────────────────────────────────

  test('switches to Phone OTP method', async ({ page }) => {
    await page.getByRole('button', { name: /^Phone$/i }).click()
    await expect(page.getByText('+91')).toBeVisible()
    await expect(page.getByPlaceholder('98765 43210')).toBeVisible()
  })

  test('shows validation error for invalid phone number', async ({ page }) => {
    await page.getByRole('button', { name: /^Phone$/i }).click()
    await page.getByPlaceholder('98765 43210').fill('123')
    await page.getByRole('button', { name: /Send code/i }).click()

    await expect(page.locator('.error-text')).toBeVisible()
  })

  // ── Error clearing on method switch ──────────────────────────────────────

  test('clears error when switching login methods', async ({ page }) => {
    await mockPasswordLoginFailure(page)

    await page.getByPlaceholder('jane_doe or you@example.com').fill('jane')
    await page.getByPlaceholder('Your password').fill('bad')
    await page.getByRole('button', { name: /^Sign in$/ }).click()

    await expect(page.locator('.error-text')).toBeVisible()

    await page.getByRole('button', { name: /^Email$/i }).click()
    await expect(page.locator('.error-text')).not.toBeVisible()
  })

  // ── Guest login ───────────────────────────────────────────────────────────

  test('logs in as guest and navigates to chat', async ({ page }) => {
    await mockGuestLogin(page)
    await mockChatApis(page)

    await page.getByRole('button', { name: /Continue as Guest/i }).click()
    await expect(page).toHaveURL(/\/chat/)
  })

  test('shows error on guest login failure', async ({ page }) => {
    await page.route('**/api/v1/auth/guest', (route) => {
      route.fulfill({ status: 400, json: { success: false, message: 'Guest login failed' } })
    })

    await page.getByRole('button', { name: /Continue as Guest/i }).click()
    await expect(page.locator('.error-text')).toContainText('Guest login failed')
  })

  // ── OAuth2 buttons ────────────────────────────────────────────────────────

  test('Google OAuth button triggers navigation', async ({ page }) => {
    // Intercept the navigation and verify the target URL contains the provider name
    let oauthUrl = ''
    page.on('request', (req) => {
      if (req.url().includes('oauth2/authorization')) oauthUrl = req.url()
    })

    // Block the actual redirect so the page doesn't navigate away
    await page.route('**/oauth2/authorization/google', (route) => route.abort())

    await page.getByRole('button', { name: /Google/i }).click()
    await expect(oauthUrl).toContain('google')
  })

  test('GitHub OAuth button triggers navigation', async ({ page }) => {
    let oauthUrl = ''
    page.on('request', (req) => {
      if (req.url().includes('oauth2/authorization')) oauthUrl = req.url()
    })

    await page.route('**/oauth2/authorization/github', (route) => route.abort())

    await page.getByRole('button', { name: /GitHub/i }).click()
    await expect(oauthUrl).toContain('github')
  })
})
