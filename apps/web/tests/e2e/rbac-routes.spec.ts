import { expect, test } from '@playwright/test'

// P1 Step 7 minimum-viable e2e: prove the role-keyed routes exist and
// are protected. Authenticated RBAC scenarios (super_admin sees admin
// sidebar, partner sees partner sidebar, cross-tenant isolation) need a
// dedicated Supabase test project + seeded fixtures and live in
// tests/e2e/rbac-authed.spec.ts in a follow-up session.
//
// All checks here are read-only against prod and assume only that the
// route exists + ProtectedRoute redirects to /login when unauth.

test.describe('P1 RBAC route smoke', () => {
    test('/admin redirects unauth users to /login', async ({ page }) => {
        await page.goto('/admin')
        await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
    })

    test('/partner redirects unauth users to /login', async ({ page }) => {
        await page.goto('/partner')
        await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
    })

    test('/claws redirects unauth users to /login', async ({ page }) => {
        await page.goto('/claws')
        await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
    })

    test('/admin/codes/mint (mint wizard) redirects unauth users to /login', async ({
        page
    }) => {
        await page.goto('/admin/codes/mint')
        await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
    })

    test('/claws/redeem redirects unauth users to /login', async ({ page }) => {
        await page.goto('/claws/redeem')
        await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
    })

    test('/aios redirects unauth users to /login', async ({ page }) => {
        await page.goto('/aios')
        await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
    })

    test('/aios/install redirects unauth users to /login', async ({
        page
    }) => {
        await page.goto('/aios/install')
        await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
    })

    test('/admin/fleet redirects unauth users to /login (canonical sub-route)', async ({
        page
    }) => {
        await page.goto('/admin/fleet')
        await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
    })
})