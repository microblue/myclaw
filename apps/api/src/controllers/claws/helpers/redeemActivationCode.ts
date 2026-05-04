import type { AuthenticatedContext } from '@/ts/Types'

import crypto from 'crypto'
import { eq, and, count } from 'drizzle-orm'
import { inputValidation, clawStatus, billingInterval } from '@openclaw/shared'
import { db } from '@/db'
import { claws, sshKeys, activationCodes } from '@/db/schema'
import {
    generatePassword,
    generateClawName,
    generateSlug,
    generateToken,
    provisionClawServer
} from '@/controllers/claws/helpers'
import { subscriptionStatus } from '@/lib/constants'
import { providerRegistry } from '@/services/providers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'

interface RedeemArgs {
    c: AuthenticatedContext
    userId: string
    code: string
    name?: string
    clawType: string
    password?: string
    sshKeyId?: string
    volumeSize?: number
}

const redeemActivationCode = async ({
    c,
    userId,
    code,
    name: rawName,
    clawType,
    password,
    sshKeyId,
    volumeSize
}: RedeemArgs) => {
    const trimmedCode = code.trim()
    if (!trimmedCode) return fail(c, 'Activation code is required.', 400)

    const codeRow = await db
        .select()
        .from(activationCodes)
        .where(eq(activationCodes.code, trimmedCode))
        .limit(1)
        .then((rows) => rows[0])

    if (!codeRow) return fail(c, 'Activation code not found.', 400)
    if (codeRow.status === 'redeemed')
        return fail(c, 'This activation code has already been redeemed.', 400)
    if (codeRow.status === 'voided')
        return fail(c, 'This activation code has been voided.', 400)
    if (codeRow.expiresAt && codeRow.expiresAt < new Date())
        return fail(c, 'This activation code has expired.', 400)

    const provider = providerRegistry.getProvider(codeRow.provider)
    if (!provider) return fail(c, t('api.providerNotAvailable'), 400)

    // Region was locked at mint time, but defend against the provider
    // disabling it between mint and redeem (region retired, plan
    // delisted in that location, etc.).
    const region = codeRow.region
    const locations = await provider.getLocations()
    const selectedLocation = locations.find((l) => l.id === region)
    if (!selectedLocation || selectedLocation.disabled)
        return fail(c, t('api.invalidLocation'), 400)

    const planAvailability = await provider.getPlanAvailability()
    const availableLocations = planAvailability[codeRow.planId]
    if (
        availableLocations &&
        availableLocations.length > 0 &&
        !availableLocations.includes(region)
    ) {
        return fail(c, t('api.planNotAvailableAtLocation'), 400)
    }

    const [clawCountResult, sshKeyResult] = await Promise.all([
        db
            .select({ value: count() })
            .from(claws)
            .where(eq(claws.userId, userId)),
        sshKeyId
            ? db
                  .select()
                  .from(sshKeys)
                  .where(
                      and(eq(sshKeys.id, sshKeyId), eq(sshKeys.userId, userId))
                  )
                  .limit(1)
            : Promise.resolve(null)
    ])

    if (clawCountResult[0].value >= inputValidation.CLAWS_PER_ACCOUNT.MAX) {
        return fail(
            c,
            t('api.clawLimitReached', {
                max: inputValidation.CLAWS_PER_ACCOUNT.MAX
            }),
            400
        )
    }

    if (sshKeyId && (!sshKeyResult || !sshKeyResult[0])) {
        return fail(c, t('api.sshKeyNotFound'), 404)
    }

    const clawId = crypto.randomUUID()
    const subdomain = generateSlug(clawId)
    const gatewayToken = generateToken()
    const fakeSubId = `code-sub-${clawId}`
    const name = rawName || generateClawName()
    const finalPassword = password || generatePassword()

    // Compute claw lifetime from validityMonths (null = perpetual). We add
    // months in JS rather than Postgres so the math sits next to the redeem
    // path and tests can assert on a single Date.
    let deletionScheduledAt: Date | null = null
    if (codeRow.validityMonths != null) {
        deletionScheduledAt = new Date()
        deletionScheduledAt.setMonth(
            deletionScheduledAt.getMonth() + codeRow.validityMonths
        )
    }

    // Atomically claim the code, then insert the claw. The `status = 'unused'`
    // guard in the WHERE clause makes concurrent redemptions safe — the
    // second update returns 0 rows and we bail before inserting any claw.
    const claimedRows = await db
        .update(activationCodes)
        .set({
            status: 'redeemed',
            redeemedByUserId: userId,
            redeemedClawId: clawId,
            redeemedAt: new Date()
        })
        .where(
            and(
                eq(activationCodes.id, codeRow.id),
                eq(activationCodes.status, 'unused')
            )
        )
        .returning({ id: activationCodes.id })

    if (claimedRows.length === 0)
        return fail(c, 'This activation code has already been redeemed.', 400)

    try {
        await db.insert(claws).values({
            id: clawId,
            userId,
            name,
            clawType,
            status: clawStatus.creating,
            planId: codeRow.planId,
            location: region,
            provider: codeRow.provider,
            rootPassword: finalPassword,
            sshKeyId: sshKeyId || null,
            subdomain,
            gatewayToken,
            polarSubscriptionId: fakeSubId,
            polarProductId: 'activation-code',
            polarCustomerId: 'activation-code',
            subscriptionStatus: subscriptionStatus.active,
            billingInterval: billingInterval.MONTH,
            activationCodeId: codeRow.id,
            deletionScheduledAt
        })
    } catch (err) {
        // Roll back the code claim so a transient DB error doesn't burn
        // the partner's code.
        await db
            .update(activationCodes)
            .set({
                status: 'unused',
                redeemedByUserId: null,
                redeemedClawId: null,
                redeemedAt: null
            })
            .where(eq(activationCodes.id, codeRow.id))
        throw err
    }

    void provisionClawServer({
        clawId,
        volumeSize: volumeSize ?? null
    }).catch((err) =>
        console.error(
            '[ACTIVATION CODE] background provisioning failed',
            err
        )
    )

    return ok(
        c,
        {
            checkoutUrl: `/claws?provisioning=${clawId}`,
            checkoutId: `code-checkout-${clawId}`,
            pendingClawId: clawId,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            devMode: true,
            activationCode: true
        },
        t('api.clawPurchaseInitiated')
    )
}

export default redeemActivationCode