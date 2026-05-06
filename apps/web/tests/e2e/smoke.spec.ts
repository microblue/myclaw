import { expect, test } from '@playwright/test'

// T0 smoke harness. These run after every prod deploy and confirm the
// baseline surfaces still load. Anything stronger lives in per-phase
// spec files (auth.spec, rbac.spec, redeem.spec, ...).
//
// Rules:
//  - read-only against prod (no signups, no mutations)
//  - flaky-tolerant (retries=2 in CI)
//  - fast (each test < 10s)

test.describe('public surface smoke', () => {
    test('homepage responds 200 and renders title', async ({ page }) => {
        const response = await page.goto('/')
        expect(response?.status(), 'homepage HTTP status').toBeLessThan(400)
        await expect(page).toHaveTitle(/MyClaw\.One/i)
    })

    test('login page hydrates with email + password fields', async ({
        page
    }) => {
        await page.goto('/login')
        await expect(
            page.getByRole('textbox', { name: /email/i })
        ).toBeVisible({ timeout: 15_000 })
        await expect(
            page.getByRole('textbox', { name: /password/i })
        ).toBeVisible()
    })

    test('login submit button stays disabled with empty inputs', async ({
        page
    }) => {
        await page.goto('/login')
        const submit = page.getByRole('button', { name: /sign in|log in/i })
        await expect(submit).toBeVisible({ timeout: 15_000 })
        // Form-level guard: empty inputs keep submit unclickable. Stronger
        // signal than browser-native required validation since it survives
        // refactors that remove `required` attributes.
        await expect(submit).toBeDisabled()
    })
})