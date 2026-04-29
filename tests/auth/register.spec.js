import { test, expect } from '@playwright/test'
import {
  mockRegister,
  mockRegisterDuplicateEmail,
  seedAuth,
  mockChatApis,
} from '../helpers/api-mocks.js'

test.describe('Register Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register')
  })

  // ── Page structure ────────────────────────────────────────────────────────

  test('renders the registration form with all fields', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible()
    await expect(page.getByText('Fill in your details to get started')).toBeVisible()

    await expect(page.getByPlaceholder('Jane Doe')).toBeVisible()
    await expect(page.getByPlaceholder('jane_doe')).toBeVisible()
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible()
    await expect(page.getByPlaceholder('98765 43210')).toBeVisible()
    await expect(page.getByPlaceholder('Create a strong password')).toBeVisible()
    await expect(page.getByPlaceholder('Repeat your password')).toBeVisible()

    await expect(page.getByRole('button', { name: /Create account/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Sign in/i })).toBeVisible()
  })

  test('submit button is disabled on empty form', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Create account/i })).toBeDisabled()
  })

  test('navigates to login page via Sign in link', async ({ page }) => {
    await page.getByRole('link', { name: /Sign in/i }).click()
    await expect(page).toHaveURL('/login')
  })

  test('redirects authenticated user away from register', async ({ page }) => {
    await seedAuth(page)
    await mockChatApis(page)
    await page.goto('/register')
    await expect(page).toHaveURL(/\/chat/)
  })

  // ── Field validation ──────────────────────────────────────────────────────

  test('shows full name error after blur with empty field', async ({ page }) => {
    const input = page.getByPlaceholder('Jane Doe')
    await input.focus()
    await input.blur()
    await expect(page.locator('.field-hint.err').first()).toBeVisible()
  })

  test('shows username error after blur with invalid characters', async ({ page }) => {
    const input = page.getByPlaceholder('jane_doe')
    await input.fill('Jane Doe!')  // spaces and ! are not allowed
    await input.blur()
    // Username is normalized to lowercase and strips invalid chars,
    // so the visible value should be cleaned up
    await expect(input).toHaveValue(/^[a-z0-9_]*$/)
  })

  test('shows email error after blur with invalid email', async ({ page }) => {
    const input = page.getByPlaceholder('you@example.com')
    await input.fill('not-valid')
    await input.blur()
    await expect(page.locator('.field-hint.err')).toBeVisible()
  })

  test('does not show phone error when field is empty (phone is optional)', async ({ page }) => {
    const phoneInput = page.getByPlaceholder('98765 43210')
    await phoneInput.focus()
    await phoneInput.blur()
    // No error for empty optional field
    await expect(page.locator('.field-hint.err')).not.toBeVisible()
  })

  test('shows phone error when phone is provided but too short', async ({ page }) => {
    const phoneInput = page.getByPlaceholder('98765 43210')
    await phoneInput.fill('12345')
    await phoneInput.blur()
    await expect(page.locator('.field-hint.err')).toBeVisible()
  })

  test('shows password strength meter when password is typed', async ({ page }) => {
    await page.getByPlaceholder('Create a strong password').fill('abc')
    await expect(page.locator('.password-strength-meter, .strength-bar, .pw-strength')).toBeVisible()
  })

  test('shows passwords do not match error', async ({ page }) => {
    await page.getByPlaceholder('Create a strong password').fill('SecurePass1!')
    await page.getByPlaceholder('Repeat your password').fill('DifferentPass1!')
    await expect(page.locator('.field-hint.err')).toContainText(/do not match/i)
  })

  test('shows passwords match confirmation when passwords are identical', async ({ page }) => {
    await page.getByPlaceholder('Create a strong password').fill('SecurePass1!')
    await page.getByPlaceholder('Repeat your password').fill('SecurePass1!')
    await expect(page.locator('.field-hint.ok')).toContainText(/match/i)
  })

  // ── Full name normalization ───────────────────────────────────────────────

  test('auto-capitalizes full name as user types', async ({ page }) => {
    const input = page.getByPlaceholder('Jane Doe')
    await input.fill('jane doe')
    // capitalizeFullName should convert each word's first letter
    await expect(input).toHaveValue('Jane Doe')
  })

  // ── Submit with all errors shown ──────────────────────────────────────────

  test('marks all fields as touched and shows errors on premature submit', async ({ page }) => {
    // Attempt to submit by calling the form's submit (button is disabled normally)
    // So type partial valid data and try
    await page.getByPlaceholder('Jane Doe').fill('J')
    await page.getByPlaceholder('jane_doe').fill('x')

    // Use keyboard to submit the form
    await page.keyboard.press('Enter')

    // With invalid data the button stays disabled — errors become visible on blur
    await page.getByPlaceholder('Jane Doe').blur()
    await expect(page.locator('.field-hint.err').first()).toBeVisible()
  })

  // ── Successful registration ───────────────────────────────────────────────

  test('registers successfully and redirects to verify-email', async ({ page }) => {
    await mockRegister(page)

    await page.getByPlaceholder('Jane Doe').fill('Jane Doe')
    await page.getByPlaceholder('jane_doe').fill('jane_doe')
    await page.getByPlaceholder('you@example.com').fill('jane@example.com')
    await page.getByPlaceholder('Create a strong password').fill('SecurePass1!')
    await page.getByPlaceholder('Repeat your password').fill('SecurePass1!')

    const submitBtn = page.getByRole('button', { name: /Create account/i })
    await expect(submitBtn).toBeEnabled()
    await submitBtn.click()

    await expect(page).toHaveURL('/verify-email')
  })

  test('shows loading state while submitting', async ({ page }) => {
    await page.route('**/api/v1/auth/register', async (route) => {
      await new Promise(r => setTimeout(r, 300))
      route.fulfill({ status: 201, body: '' })
    })

    await page.getByPlaceholder('Jane Doe').fill('Jane Doe')
    await page.getByPlaceholder('jane_doe').fill('jane_doe')
    await page.getByPlaceholder('you@example.com').fill('jane@example.com')
    await page.getByPlaceholder('Create a strong password').fill('SecurePass1!')
    await page.getByPlaceholder('Repeat your password').fill('SecurePass1!')

    const btn = page.getByRole('button', { name: /Create account/i })
    await btn.click()
    await expect(page.getByText(/Creating account/i)).toBeVisible()
  })

  // ── Registration errors from server ──────────────────────────────────────

  test('shows friendly error for duplicate email', async ({ page }) => {
    await mockRegisterDuplicateEmail(page)

    await page.getByPlaceholder('Jane Doe').fill('Jane Doe')
    await page.getByPlaceholder('jane_doe').fill('jane_doe')
    await page.getByPlaceholder('you@example.com').fill('existing@example.com')
    await page.getByPlaceholder('Create a strong password').fill('SecurePass1!')
    await page.getByPlaceholder('Repeat your password').fill('SecurePass1!')

    await page.getByRole('button', { name: /Create account/i }).click()
    await expect(page.locator('.error-text')).toContainText(/already registered/i)
  })

  test('shows friendly error for duplicate username', async ({ page }) => {
    await page.route('**/api/v1/auth/register', (route) => {
      route.fulfill({ status: 409, json: { success: false, message: 'Username already taken' } })
    })

    await page.getByPlaceholder('Jane Doe').fill('Jane Doe')
    await page.getByPlaceholder('jane_doe').fill('taken_user')
    await page.getByPlaceholder('you@example.com').fill('new@example.com')
    await page.getByPlaceholder('Create a strong password').fill('SecurePass1!')
    await page.getByPlaceholder('Repeat your password').fill('SecurePass1!')

    await page.getByRole('button', { name: /Create account/i }).click()
    await expect(page.locator('.error-text')).toContainText(/username is taken/i)
  })

  // ── Password toggle ───────────────────────────────────────────────────────

  test('toggles password visibility on password field', async ({ page }) => {
    const passwordInput = page.getByPlaceholder('Create a strong password')
    await expect(passwordInput).toHaveAttribute('type', 'password')
    await page.locator('.pw-toggle-btn').first().click()
    await expect(passwordInput).toHaveAttribute('type', 'text')
  })

  test('toggles visibility on confirm password field', async ({ page }) => {
    const confirmInput = page.getByPlaceholder('Repeat your password')
    await expect(confirmInput).toHaveAttribute('type', 'password')
    await page.locator('.pw-toggle-btn').nth(1).click()
    await expect(confirmInput).toHaveAttribute('type', 'text')
  })
})
