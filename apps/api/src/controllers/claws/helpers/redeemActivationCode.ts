import type { AuthenticatedContext } from '@/ts/Types'

import crypto from 'crypto'
import { eq, and, count, sql } from 'drizzle-orm'
import { inputValidation, clawStatus, billingInterval } from '@openclaw/shared'
import { db } from '@/db'
import {
    claws,
    sshKeys,
    activationCodes,
    activationSeats,
    clawInstallPhases
} from '@/db/schema'
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
    extendsClawId?: string
}

const addDays = (base: Date, days: number): Date => {
    const next = new Date(base.getTime())
    next.setUTCDate(next.getUTCDate() + days)
    return next
}

const redeemActivationCode = async ({
    c,
    userId,
    code,
    name: rawName,
    clawType,
    password,
    sshKeyId,
    volumeSize,
    extendsClawId
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
    if (codeRow.status === 'redeemed' || codeRow.seatsUsed >= codeRow.seats)
        return fail(c, 'This activation code has no seats left.', 400)
    if (codeRow.status === 'voided')
        return fail(c, 'This activation code has been voided.', 400)
    if (codeRow.expiresAt && codeRow.expiresAt < new Date())
        return fail(c, 'This activation code has expired.', 400)

    if (codeRow.skuKind === 'renewal') {
        return redeemRenewal({ c, userId, codeRow, extendsClawId })
    }
    return redeemNew({
        c,
        userId,
        codeRow,
        rawName,
        clawType,
        password,
        sshKeyId,
        volumeSize
    })
}

// CAS-style "claim one seat" against the activation_codes row. Concurrent
// redemptions of the last seat will only succeed for one caller — the
// loser's update returns 0 rows and we surface the standard error.
async function claimSeat(codeId: string): Promise<boolean> {
    const claimed = await db
        .update(activationCodes)
        .set({
            seatsUsed: sql`${activationCodes.seatsUsed} + 1`,
            // Flip status to 'redeemed' iff this update fills the last seat.
            status: sql`CASE WHEN ${activationCodes.seatsUsed} + 1 >= ${activationCodes.seats} THEN 'redeemed' ELSE ${activationCodes.status} END`
        })
        .where(
            and(
                eq(activationCodes.id, codeId),
                sql`${activationCodes.seatsUsed} < ${activationCodes.seats}`,
                sql`${activationCodes.status} <> 'voided'`
            )
        )
        .returning({ id: activationCodes.id })
    return claimed.length > 0
}

async function releaseSeat(codeId: string): Promise<void> {
    await db
        .update(activationCodes)
        .set({
            seatsUsed: sql`GREATEST(${activationCodes.seatsUsed} - 1, 0)`,
            status: sql`CASE WHEN ${activationCodes.status} = 'redeemed' THEN 'unused' ELSE ${activationCodes.status} END`
        })
        .where(eq(activationCodes.id, codeId))
}

interface RedeemNewArgs {
    c: AuthenticatedContext
    userId: string
    codeRow: typeof activationCodes.$inferSelect
    rawName?: string
    clawType: string
    password?: string
    sshKeyId?: string
    volumeSize?: number
}

async function redeemNew({
    c,
    userId,
    codeRow,
    rawName,
    clawType,
    password,
    sshKeyId,
    volumeSize
}: RedeemNewArgs) {
    if (!codeRow.planId || !codeRow.provider || !codeRow.region) {
        return fail(
            c,
            'This code is missing plan/provider/region — refusing to provision.',
            400
        )
    }

    const provider = providerRegistry.getProvider(codeRow.provider)
    if (!provider) return fail(c, t('api.providerNotAvailable'), 400)

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
    // Outbound bearer the cloud-init script uses to call back into
    // /install/:clawId/phase. Lives only on the row + baked into the
    // userData; the SPA never sees it (sanitizeClaw strips it).
    const centralToken = generateToken()
    // ULID-shaped run identifier scoped to this single install attempt.
    // Web Realtime subscription filters on this, so a re-install
    // doesn't replay the prior attempt's logs.
    const installRunId = crypto.randomUUID()
    const fakeSubId = `code-sub-${clawId}`
    const name = rawName || generateClawName()
    const finalPassword = password || generatePassword()

    const deletionScheduledAt =
        codeRow.validityDays != null
            ? addDays(new Date(), codeRow.validityDays)
            : null

    if (!(await claimSeat(codeRow.id))) {
        return fail(c, 'This activation code has no seats left.', 400)
    }

    const seatId = crypto.randomUUID()

    try {
        await db.transaction(async (tx) => {
            await tx.insert(claws).values({
                id: clawId,
                userId,
                name,
                clawType,
                status: clawStatus.creating,
                planId: codeRow.planId!,
                location: codeRow.region!,
                provider: codeRow.provider!,
                rootPassword: finalPassword,
                sshKeyId: sshKeyId || null,
                subdomain,
                gatewayToken,
                centralToken,
                installRunId,
                polarSubscriptionId: fakeSubId,
                polarProductId: 'activation-code',
                polarCustomerId: 'activation-code',
                subscriptionStatus: subscriptionStatus.active,
                billingInterval: billingInterval.MONTH,
                activationCodeId: codeRow.id,
                deletionScheduledAt
            })
            await tx.insert(activationSeats).values({
                id: seatId,
                activationCodeId: codeRow.id,
                redeemedByUserId: userId,
                clawId,
                expiresAt: deletionScheduledAt
            })
            // Mirror the latest seat's coordinates onto the parent code
            // for the admin list's quick-glance view.
            await tx
                .update(activationCodes)
                .set({
                    redeemedByUserId: userId,
                    redeemedClawId: clawId,
                    redeemedAt: new Date()
                })
                .where(eq(activationCodes.id, codeRow.id))
        })
    } catch (err) {
        await releaseSeat(codeRow.id)
        throw err
    }

    // Seed the install-progress stream BEFORE provisioning kicks off
    // so the user lands on /install/:clawId and immediately sees the
    // "renting compute" step active rather than a blank checklist
    // until the VM boots and cloud-init's first phase POST lands.
    await db.insert(clawInstallPhases).values({
        id: crypto.randomUUID(),
        clawId,
        installRunId,
        phase: 'renting_compute',
        logChunk: '',
        createdAt: new Date()
    })

    void provisionClawServer({
        clawId,
        volumeSize: volumeSize ?? null
    }).catch((err) =>
        console.error('[ACTIVATION CODE] background provisioning failed', err)
    )

    return ok(
        c,
        {
            // Land on the install-progress page so the user sees the
            // phase animation + log tail. Old `/claws?provisioning=` is
            // dead — kept only in commit history for reference.
            checkoutUrl: `/install/${clawId}`,
            checkoutId: `code-checkout-${clawId}`,
            pendingClawId: clawId,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            devMode: true,
            activationCode: true
        },
        t('api.clawPurchaseInitiated')
    )
}

interface RedeemRenewalArgs {
    c: AuthenticatedContext
    userId: string
    codeRow: typeof activationCodes.$inferSelect
    extendsClawId?: string
}

async function redeemRenewal({
    c,
    userId,
    codeRow,
    extendsClawId
}: RedeemRenewalArgs) {
    if (!extendsClawId)
        return fail(c, 'Pick a claw to extend before redeeming a renewal code.', 400)
    if (codeRow.validityDays == null)
        return fail(
            c,
            'Renewal codes must carry a validity (perpetual renewals are not supported).',
            400
        )

    const target = await db
        .select()
        .from(claws)
        .where(and(eq(claws.id, extendsClawId), eq(claws.userId, userId)))
        .limit(1)
        .then((rows) => rows[0])

    if (!target)
        return fail(c, "We couldn't find that claw on your account.", 404)

    // Future: allow upgrade by accepting a renewal code whose plan tier
    // is at-or-above the target's. For v1 we keep it strict — same plan,
    // same provider — to avoid surprise mid-flight VPS resizes.
    if (codeRow.planId && codeRow.planId !== target.planId)
        return fail(
            c,
            "This renewal code is for a different plan than this claw.",
            400
        )
    if (codeRow.provider && codeRow.provider !== target.provider)
        return fail(
            c,
            "This renewal code is for a different provider than this claw.",
            400
        )

    if (!(await claimSeat(codeRow.id))) {
        return fail(c, 'This activation code has no seats left.', 400)
    }

    const seatId = crypto.randomUUID()

    // Anchor the new expiry on whichever is later: the existing
    // deletion timer or now(). Prevents users from "renewing" an
    // already-dead claw and gaining only a fraction of the days they
    // paid for, while also making "renew early" feel additive.
    const anchor =
        target.deletionScheduledAt && target.deletionScheduledAt > new Date()
            ? target.deletionScheduledAt
            : new Date()
    const newExpiry = addDays(anchor, codeRow.validityDays)

    try {
        await db.transaction(async (tx) => {
            await tx
                .update(claws)
                .set({ deletionScheduledAt: newExpiry })
                .where(eq(claws.id, target.id))
            await tx.insert(activationSeats).values({
                id: seatId,
                activationCodeId: codeRow.id,
                redeemedByUserId: userId,
                clawId: target.id,
                expiresAt: newExpiry
            })
            await tx
                .update(activationCodes)
                .set({
                    redeemedByUserId: userId,
                    redeemedClawId: target.id,
                    redeemedAt: new Date()
                })
                .where(eq(activationCodes.id, codeRow.id))
        })
    } catch (err) {
        await releaseSeat(codeRow.id)
        throw err
    }

    return ok(
        c,
        {
            renewedClawId: target.id,
            extendedTo: newExpiry.toISOString(),
            activationCode: true,
            devMode: true
        },
        'Renewal applied.'
    )
}

export default redeemActivationCode