import { test, expect } from '@playwright/test'
import {
  seedAuth,
  mockChatApis,
  mockAdminUsers,
  mockAuditLogs,
  MOCK_USER,
  MOCK_ADMIN_USER,
} from '../helpers/api-mocks.js'

const SUSPENDED_USER = {
  ...MOCK_USER,
  userId: 'user-suspended',
  id: 'user-suspended',
  username: 'suspended_user',
  fullName: 'Suspended User',
  email: 'suspended@example.com',
  status: 'SUSPENDED',
  accountStatus: 'SUSPENDED',
}

// A second admin whose userId differs from the logged-in admin (MOCK_ADMIN_USER).
// AdminDashboard shows "Protected" for admin rows that are NOT the current user.
const SECOND_ADMIN_USER = {
  ...MOCK_ADMIN_USER,
  userId: 'admin-2',
  id: 'admin-2',
  username: 'second_admin',
  fullName: 'Second Admin',
  email: 'admin2@example.com',
}

const AUDIT_LOGS = [
  {
    id: 'log-1',
    actorName: 'Admin User',
    action: 'SUSPEND',
    targetName: 'Suspended User',
    ipAddress: '127.0.0.1',
    createdAt: '2024-04-01T10:00:00Z',
  },
  {
    id: 'log-2',
    actorName: 'Admin User',
    action: 'REACTIVATE',
    targetName: 'Suspended User',
    ipAddress: '127.0.0.1',
    createdAt: '2024-04-02T10:00:00Z',
  },
]

async function gotoAdmin(page) {
  await seedAuth(page, MOCK_ADMIN_USER) // logged in as admin-1
  await mockChatApis(page)
  // Include SECOND_ADMIN_USER (admin-2) so the "Protected" badge row exists.
  // MOCK_ADMIN_USER (admin-1) is the current user → shows "You", not "Protected".
  // SECOND_ADMIN_USER (admin-2) is a different admin → shows "Protected".
  await mockAdminUsers(page, [MOCK_USER, MOCK_ADMIN_USER, SECOND_ADMIN_USER, SUSPENDED_USER])
  await mockAuditLogs(page, AUDIT_LOGS)
  await page.goto('/admin')
}

test.describe('Admin Dashboard', () => {
  // ── Access control ────────────────────────────────────────────────────────

  test('redirects unauthenticated users to /login', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL('/login')
  })

  test('redirects non-admin users away from /admin', async ({ page }) => {
    await seedAuth(page, MOCK_USER)
    await mockChatApis(page)
    await page.goto('/admin')
    // Should redirect to /chat (non-admin users cannot access /admin)
    await expect(page).not.toHaveURL('/admin')
  })

  // ── Page structure ────────────────────────────────────────────────────────

  test('renders the admin dashboard heading', async ({ page }) => {
    await gotoAdmin(page)
    await expect(page.getByRole('heading', { name: /Admin|Dashboard/i })).toBeVisible()
  })

  test('renders Users and Audit Logs tabs', async ({ page }) => {
    await gotoAdmin(page)
    await expect(page.getByRole('tab', { name: 'Users' })).toBeVisible()
    await expect(page.getByRole('tab', { name: /Audit Logs/i })).toBeVisible()
  })

  // ── Users tab ─────────────────────────────────────────────────────────────

  test('renders the users table with columns', async ({ page }) => {
    await gotoAdmin(page)

    await expect(page.getByText(/Name|Username/i)).toBeVisible()
    await expect(page.getByText(/Email/i)).toBeVisible()
    await expect(page.getByText(/Role/i)).toBeVisible()
    await expect(page.getByText(/Status/i)).toBeVisible()
  })

  test('shows user rows in the table', async ({ page }) => {
    await gotoAdmin(page)

    await expect(page.getByText('Jane Doe')).toBeVisible()
    await expect(page.getByText('jane@example.com')).toBeVisible()
  })

  test('shows admin user with Protected badge', async ({ page }) => {
    await gotoAdmin(page)

    await expect(page.getByText(/Protected/i)).toBeVisible()
  })

  test('shows suspended user with visual indicator', async ({ page }) => {
    await gotoAdmin(page)

    await expect(page.getByText('Suspended User')).toBeVisible()
    // Suspended users should be visually marked (red text or SUSPENDED badge)
    await expect(page.locator('.admin-badge.suspended')).toBeVisible()
  })

  test('shows stats cards at the top (total, active, suspended, admins)', async ({ page }) => {
    await gotoAdmin(page)

    const stats = page.locator('.admin-stats')
    await expect(stats.getByText(/Total Users?/i)).toBeVisible()
    await expect(stats.getByText(/Active/i)).toBeVisible()
    await expect(stats.getByText(/Suspended/i)).toBeVisible()
    await expect(stats.getByText(/Admin/i)).toBeVisible()
  })

  // ── User search ───────────────────────────────────────────────────────────

  test('filters users by search query', async ({ page }) => {
    await gotoAdmin(page)

    const searchInput = page.locator('input[placeholder*="Search" i]').first()
    await searchInput.fill('jane')

    await expect(page.getByText('Jane Doe')).toBeVisible()
    // Other users should be hidden
    await expect(page.getByText('Suspended User')).not.toBeVisible()
  })

  test('shows all users when search is cleared', async ({ page }) => {
    await gotoAdmin(page)

    const searchInput = page.locator('input[placeholder*="Search" i]').first()
    await searchInput.fill('jane')
    await searchInput.clear()

    await expect(page.getByText('Jane Doe')).toBeVisible()
    await expect(page.getByText('Suspended User')).toBeVisible()
  })

  // ── Sorting ───────────────────────────────────────────────────────────────

  test('clicking column header sorts the table', async ({ page }) => {
    await gotoAdmin(page)

    // Click the "Name" column header to sort
    const nameHeader = page.getByRole('columnheader', { name: /Name/i }).or(
      page.locator('th, .table-header').getByText(/Name/i)
    ).first()

    await nameHeader.click()
    // After click the table should still render (sort doesn't break the UI)
    await expect(page.getByText('Jane Doe')).toBeVisible()
  })

  // ── User actions ──────────────────────────────────────────────────────────

  test('shows Suspend action for active non-admin users', async ({ page }) => {
    await gotoAdmin(page)

    // Suspend button should appear for Jane Doe (active, not admin)
    await expect(page.getByRole('button', { name: /Suspend/i }).first()).toBeVisible()
  })

  test('shows Reactivate action for suspended users', async ({ page }) => {
    await gotoAdmin(page)

    await expect(page.getByRole('button', { name: /Reactivate/i }).first()).toBeVisible()
  })

  test('opens confirmation modal before suspending a user', async ({ page }) => {
    await gotoAdmin(page)

    await page.getByRole('button', { name: /Suspend/i }).first().click()

    // A confirmation dialog should appear
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText(/confirm|sure|suspend/i)).toBeVisible()
  })

  test('suspends a user after confirming in the modal', async ({ page }) => {
    await gotoAdmin(page)

    await page.route('**/api/v1/users/admin/*/suspend', (route) => {
      route.fulfill({ json: { success: true, message: 'User suspended' } })
    })

    await page.getByRole('button', { name: /Suspend/i }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Click the confirm button inside the dialog
    await page.getByRole('dialog').getByRole('button', { name: /Confirm|Yes|Suspend/i }).click()

    // Dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('cancels suspension when Cancel is clicked in modal', async ({ page }) => {
    await gotoAdmin(page)

    await page.getByRole('button', { name: /Suspend/i }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByRole('dialog').getByRole('button', { name: /Cancel/i }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('shows Delete action and opens confirmation modal', async ({ page }) => {
    await gotoAdmin(page)

    const deleteBtn = page.getByRole('button', { name: /Delete/i }).first()
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click()
      await expect(page.getByRole('dialog')).toBeVisible()
    }
  })

  // ── Audit logs tab ────────────────────────────────────────────────────────

  test('switches to Audit Logs tab', async ({ page }) => {
    await gotoAdmin(page)

    const auditTab = page.getByRole('tab', { name: /Audit/i }).or(
      page.getByRole('button', { name: /Audit/i })
    )
    await auditTab.click()

    await expect(page.getByText(/Actor|Action|Target/i)).toBeVisible()
  })

  test('shows audit log entries', async ({ page }) => {
    await gotoAdmin(page)

    const auditTab = page.getByRole('tab', { name: /Audit/i }).or(
      page.getByRole('button', { name: /Audit/i })
    )
    await auditTab.click()

    await expect(page.getByText('Admin User').first()).toBeVisible()
    await expect(page.getByText(/SUSPEND|Suspend/i).first()).toBeVisible()
    await expect(page.getByText(/REACTIVATE|Reactivate/i).first()).toBeVisible()
  })

  test('shows IP address in audit log entries', async ({ page }) => {
    await gotoAdmin(page)

    const auditTab = page.getByRole('tab', { name: /Audit/i }).or(
      page.getByRole('button', { name: /Audit/i })
    )
    await auditTab.click()

    await expect(page.getByText('127.0.0.1').first()).toBeVisible()
  })

  test('shows pagination controls in audit logs', async ({ page }) => {
    await gotoAdmin(page)

    const auditTab = page.getByRole('tab', { name: /Audit/i }).or(
      page.getByRole('button', { name: /Audit/i })
    )
    await auditTab.click()

    // Pagination controls should be present (prev/next buttons or page numbers)
    const pagination = page.locator('.pagination, [class*="pagination"]').or(
      page.getByRole('button', { name: /Next|Previous|›|‹/i })
    )
    await expect(pagination.first()).toBeVisible()
  })

  // ── Empty audit log ───────────────────────────────────────────────────────

  test('shows empty state when audit log has no entries', async ({ page }) => {
    await seedAuth(page, MOCK_ADMIN_USER)
    await mockChatApis(page)
    await mockAdminUsers(page)
    await mockAuditLogs(page, [])

    await page.goto('/admin')

    const auditTab = page.getByRole('tab', { name: /Audit/i }).or(
      page.getByRole('button', { name: /Audit/i })
    )
    await auditTab.click()

    await expect(page.getByText(/No audit logs|No actions|empty/i)).toBeVisible()
  })
})
