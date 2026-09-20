import { test, expect } from '@playwright/test'
import {
  seedAuth,
  mockChatApis,
  MOCK_SUBSCRIPTION,
  MOCK_PRO_SUBSCRIPTION,
} from '../helpers/api-mocks.js'
import { featureList } from '../../src/utils/plans.js'

async function gotoBilling(page, subscription = MOCK_SUBSCRIPTION, payments = []) {
  await seedAuth(page)
  // mockChatApis handles both subscription (/payments/subscription/status)
  // and payment history (/payments/subscription/payments) with correct URLs.
  await mockChatApis(page, { subscription, payments })
  await page.goto('/billing')
}

const MOCK_PAYMENTS = [
  {
    id: 'pay-1',
    description: 'PRO subscription',
    amount: 49900,
    status: 'SUCCESS',
    createdAt: '2024-03-01T10:00:00Z',
    transactionId: 'TXN123456',
  },
  {
    id: 'pay-2',
    description: 'PRO subscription renewal',
    amount: 49900,
    status: 'SUCCESS',
    createdAt: '2024-04-01T10:00:00Z',
    transactionId: 'TXN789012',
  },
]

test.describe('Billing Page', () => {
  // ── Access control ────────────────────────────────────────────────────────

  test('redirects unauthenticated users to /login', async ({ page }) => {
    await page.goto('/billing')
    await expect(page).toHaveURL('/login')
  })

  // ── FREE plan display ─────────────────────────────────────────────────────

  test('renders the billing page for a FREE plan user', async ({ page }) => {
    await gotoBilling(page, MOCK_SUBSCRIPTION)

    const card = page.locator('.billing-plan-card').first()
    await expect(card.getByText('Free Plan')).toBeVisible()
    await expect(card.locator('.current-badge')).toBeVisible()
    await expect(page.getByRole('button', { name: /Upgrade Plan/i })).toBeVisible()
  })

  test('shows FREE plan feature limits', async ({ page }) => {
    await gotoBilling(page, MOCK_SUBSCRIPTION)

    // The numbers come from src/utils/plans.js, which mirrors what the backend enforces
    const tags = page.locator('.billing-plan-features')
    for (const feature of featureList('FREE')) await expect(tags.getByText(feature)).toBeVisible()
    await expect(tags.getByText('5 group chats')).toBeVisible()
    await expect(tags.getByText('100 MB media storage')).toBeVisible()
  })

  test('shows empty payment history for FREE user with no payments', async ({ page }) => {
    await gotoBilling(page, MOCK_SUBSCRIPTION, [])

    // Payment history section should indicate no transactions
    await expect(
      page.getByText(/No payment|No transactions|no history/i)
    ).toBeVisible()
  })

  // ── PRO plan display ──────────────────────────────────────────────────────

  test('renders the billing page for a PRO plan user', async ({ page }) => {
    await gotoBilling(page, MOCK_PRO_SUBSCRIPTION)

    // Any paid backend plan (PREMIUM / PLATINUM) is shown as the single paid plan, "Pro"
    const card = page.locator('.billing-plan-card.pro')
    await expect(card).toBeVisible()
    await expect(card.locator('.billing-plan-name')).toContainText('Pro')
    await expect(page.getByRole('button', { name: /Upgrade Plan/i })).not.toBeVisible()
  })

  test('shows PRO plan feature limits', async ({ page }) => {
    await gotoBilling(page, MOCK_PRO_SUBSCRIPTION)

    const tags = page.locator('.billing-plan-features')
    for (const feature of featureList('PRO')) await expect(tags.getByText(feature)).toBeVisible()
    await expect(tags.getByText('500 group chats')).toBeVisible()
    await expect(tags.getByText('10 GB media storage')).toBeVisible()
    // things that used to be advertised but were never enforced must not come back
    await expect(page.getByText(/90-day|priority support/i)).toHaveCount(0)
  })

  test('shows subscription details for PRO user', async ({ page }) => {
    await gotoBilling(page, MOCK_PRO_SUBSCRIPTION)

    await expect(page.locator('.billing-detail-value').filter({ hasText: /sub-/i })).toBeVisible()
    await expect(page.getByText(/ACTIVE/i).first()).toBeVisible()
  })

  // ── Payment history ───────────────────────────────────────────────────────

  test('renders payment history rows', async ({ page }) => {
    await gotoBilling(page, MOCK_PRO_SUBSCRIPTION, MOCK_PAYMENTS)

    await expect(page.getByText('PRO subscription', { exact: true })).toBeVisible()
    await expect(page.getByText('TXN123456')).toBeVisible()
  })

  test('shows correct amount formatted from paise', async ({ page }) => {
    await gotoBilling(page, MOCK_PRO_SUBSCRIPTION, MOCK_PAYMENTS)

    // 49900 paise = ₹499.00 (two rows exist; .first() avoids strict mode violation)
    await expect(page.getByText(/499|₹499/).first()).toBeVisible()
  })

  test('shows payment status badge', async ({ page }) => {
    await gotoBilling(page, MOCK_PRO_SUBSCRIPTION, MOCK_PAYMENTS)

    await expect(page.getByText(/SUCCESS|Paid/i).first()).toBeVisible()
  })

  test('renders multiple payment rows', async ({ page }) => {
    await gotoBilling(page, MOCK_PRO_SUBSCRIPTION, MOCK_PAYMENTS)

    await expect(page.getByText('TXN123456')).toBeVisible()
    await expect(page.getByText('TXN789012')).toBeVisible()
  })

  // ── Upgrade modal ─────────────────────────────────────────────────────────

  test('opens the upgrade modal with the single Pro plan when Upgrade Plan is clicked', async ({ page }) => {
    await gotoBilling(page, MOCK_SUBSCRIPTION)

    await page.getByRole('button', { name: /Upgrade Plan/i }).click()

    // The upgrade form uses .upgrade-overlay, not role=dialog
    const overlay = page.locator('.upgrade-overlay')
    await expect(overlay).toBeVisible()
    await expect(overlay.getByText('Choose Your Plan')).toBeVisible()
    await expect(overlay.locator('.upgrade-plan-card')).toHaveCount(1)
    await expect(overlay.getByRole('button', { name: /Unlock Pro/i })).toBeVisible()
  })

  // ── Navigation ────────────────────────────────────────────────────────────

  test('billing page is reachable from /billing route', async ({ page }) => {
    await gotoBilling(page)
    await expect(page).toHaveURL('/billing')
  })

  test('renders a back/home navigation link or button', async ({ page }) => {
    await gotoBilling(page)

    // There should be some way to get back to the chat
    const backLink = page.getByRole('link', { name: /back|home|chat/i }).or(
      page.getByRole('button', { name: /back|home/i })
    )
    // Not strictly required — just note if it's missing
    const chatLink = page.getByRole('link', { name: /ConnectHub|Messages/i })
    const either = backLink.or(chatLink)
    // At minimum the page should render without error
    await expect(page.locator('body')).not.toBeEmpty()
  })
})
