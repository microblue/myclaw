import type { InitiateClawPurchaseBody } from '@/ts/Interfaces'
import type { AuthenticatedContext, BillingInterval } from '@/ts/Types'

import crypto from 'crypto'
import { eq, and, count, lt } from 'drizzle-orm'
import { inputValidation, billingInterval } from '@openclaw/shared'
import { db } from '@/db'
import { users, sshKeys, claws, pendingClaws } from '@/db/schema'
import { checkouts, customers } from '@/lib/polar'
import {
    generatePassword,
    generateClawName,
    generateSlug,
    generateToken,
    provisionClawServer
} from '@/controllers/claws/helpers'
import { clawStatus } from '@openclaw/shared'
import { subscriptionStatus } from '@/lib/constants'
import { getProvider } from '@/services/provider'
import { providerRegistry } from '@/services/providers'
import { t } from '@openclaw/i18n'
import { ok, fail } from '@/lib/response'
import { getEnvironment } from '@/lib/environment'
import withErrorHandler from '@/lib/withErrorHandler'

let lastPendingCleanup = 0
const CLEANUP_INTERVAL = 60 * 60 * 1000

const SUPPORTED_CLAW_TYPES = new Set(['openclaw'])

const PLAN_TO_POLAR: Record<string, string> = {
    cx23: 'CX23',
    cx33: 'CX33',
    cx43: 'CX43',
    cx53: 'CX53',
    cpx11: 'CPX11',
    cpx21: 'CPX21',
    cpx31: 'CPX31',
    cpx41: 'CPX41',
    cpx51: 'CPX51',
    cax11: 'CAX11',
    cax21: 'CAX21',
    cax31: 'CAX31',
    cax41: 'CAX41',
    ccx13: 'CCX13',
    ccx23: 'CCX23',
    ccx33: 'CCX33',
    ccx43: 'CCX43',
    ccx53: 'CCX53',
    ccx63: 'CCX63'
}

const getPolarProductId = (
    planId: string,
    interval: BillingInterval = billingInterval.MONTH
): string | null => {
    const polarName = PLAN_TO_POLAR[planId.toLowerCase()]
    if (!polarName) return null

    const suffix = interval === billingInterval.YEAR ? '_YEARLY' : '_MONTHLY'
    const envKey = `POLAR_PRODUCT_${polarName}${suffix}`
    const envValue = process.env[envKey]

    if (envValue) return envValue
    else return null
}

const initiateClawPurchase = withErrorHandler(
    'initiateClawPurchase',
    'api.failedToInitiatePurchase'
)(async (c: AuthenticatedContext) => {
    if (Date.now() - lastPendingCleanup > CLEANUP_INTERVAL) {
        await db
            .delete(pendingClaws)
            .where(lt(pendingClaws.expiresAt, new Date()))
        lastPendingCleanup = Date.now()
    }

    const userId = c.get('userId')
    const {
        name: rawName,
        clawType: rawClawType,
        planId,
        location,
        password,
        sshKeyId,
        volumeSize,
        priceMonthly,
        billingInterval: rawBillingInterval,
        provider: requestedProvider
    } = await c.req.json<InitiateClawPurchaseBody>()

    const clawType = rawClawType || 'openclaw'
    if (!SUPPORTED_CLAW_TYPES.has(clawType)) {
        return fail(c, t('api.clawTypeNotYetSupported'), 400)
    }

    const billingCycle =
        rawBillingInterval === billingInterval.YEAR
            ? billingInterval.YEAR
            : billingInterval.MONTH

    if (!planId || !location || !priceMonthly)
        return fail(c, t('api.missingRequiredFields'), 400)

    const name = rawName || generateClawName()

    // Check if Polar product is configured for this plan
    const productId = getPolarProductId(planId, billingCycle)
    const finalPassword = password || generatePassword()
    const referralCode = c.req.header('X-Referral-Code') || null

    // DEV MODE: no Polar product configured → skip payment, insert the
    // claws row immediately with status=creating, and kick off the real
    // provisioning in the background so the UI returns instantly and the
    // dashboard tile appears with a spinner until the server is ready.
    if (!productId) {
        console.log('[DEV MODE] No Polar product configured, inserting claw + background provisioning')

        const selectedProvider =
            requestedProvider ||
            providerRegistry.getAvailableProviders()[0]?.id ||
            'hetzner'

        const clawId = crypto.randomUUID()
        const subdomain = generateSlug(clawId)
        const gatewayToken = generateToken()
        const fakeSubId = `dev-sub-${clawId}`

        await db.insert(claws).values({
            id: clawId,
            userId,
            name,
            clawType,
            status: clawStatus.creating,
            planId,
            location,
            provider: selectedProvider,
            rootPassword: finalPassword,
            sshKeyId: sshKeyId || null,
            subdomain,
            gatewayToken,
            polarSubscriptionId: fakeSubId,
            polarProductId: 'dev-product',
            polarCustomerId: 'dev-customer',
            subscriptionStatus: subscriptionStatus.active,
            billingInterval: billingCycle
        })

        // Fire-and-forget. The helper updates the row with serverId + IP
        // when the provider finishes, or flips status to unreachable on
        // failure. We never await it.
        void provisionClawServer({
            clawId,
            volumeSize: volumeSize ?? null
        }).catch((err) =>
            console.error('[DEV MODE] background provisioning failed', err)
        )

        return ok(
            c,
            {
                checkoutUrl: `/claws?provisioning=${clawId}`,
                checkoutId: `dev-checkout-${clawId}`,
                pendingClawId: clawId,
                expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                devMode: true
            },
            t('api.clawPurchaseInitiated')
        )
    }

    // PRODUCTION MODE: Validate with provider and process payment
    // Use requested provider or default to first available
    const selectedProviderId = requestedProvider || providerRegistry.getAvailableProviders()[0]?.id || 'hetzner'
    const selectedCloudProvider = providerRegistry.getProvider(selectedProviderId)
    
    if (!selectedCloudProvider) {
        return fail(c, t('api.providerNotAvailable'), 400)
    }
    
    const [serverTypes, locations] = await Promise.all([
        selectedCloudProvider.getPlans(),
        selectedCloudProvider.getLocations()
    ])

    const selectedPlan = serverTypes.find((st) => st.name === planId)

    if (!selectedPlan) return fail(c, t('api.invalidPlan'), 400)

    if (selectedPlan.memory < inputValidation.MIN_MEMORY_GB.MIN)
        return fail(c, t('api.planBelowMinimumMemory'), 400)

    const selectedLocation = locations.find((l) => l.id === location)
    if (!selectedLocation || selectedLocation.disabled)
        return fail(c, t('api.invalidLocation'), 400)

    // Check plan availability at location
    const planAvailability = await selectedCloudProvider.getPlanAvailability()
    const availableLocations = planAvailability[planId]
    if (availableLocations && availableLocations.length > 0 && !availableLocations.includes(location)) {
        return fail(c, t('api.planNotAvailableAtLocation'), 400)
    }

    if (
        volumeSize !== undefined &&
        (volumeSize < inputValidation.VOLUME_SIZE.MIN ||
            volumeSize > inputValidation.VOLUME_SIZE.MAX)
    ) {
        return fail(
            c,
            t('api.volumeSizeInvalid', {
                min: inputValidation.VOLUME_SIZE.MIN,
                max: inputValidation.VOLUME_SIZE.MAX
            }),
            400
        )
    }

    const [clawCountResult, userResult, sshKeyResult] = await Promise.all([
        db
            .select({ value: count() })
            .from(claws)
            .where(eq(claws.userId, userId)),
        db.select().from(users).where(eq(users.id, userId)).limit(1),
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

    if (!userResult[0]) return fail(c, t('api.userNotFound'), 404)

    if (sshKeyId && (!sshKeyResult || !sshKeyResult[0])) {
        return fail(c, t('api.sshKeyNotFound'), 404)
    }

    let polarCustomerId = userResult[0].polarCustomerId

    if (!polarCustomerId) {
        const customer = await customers.getOrCreate({
            email: userResult[0].email,
            name: userResult[0].name || undefined,
            externalId: userId
        })
        polarCustomerId = customer.id

        await db
            .update(users)
            .set({ polarCustomerId })
            .where(eq(users.id, userId))
    }

    const pendingId = crypto.randomUUID()

    const checkout = await checkouts.create({
        productId,
        customerEmail: userResult[0].email,
        customerId: polarCustomerId,
        metadata: {
            pendingClawId: pendingId,
            userId,
            planId,
            location,
            name,
            billingInterval: billingCycle,
            environment: getEnvironment(c),
            ...(referralCode ? { referralCode } : {})
        }
    })

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

    await db.insert(pendingClaws).values({
        id: pendingId,
        userId,
        checkoutId: checkout.id,
        name,
        clawType,
        planId,
        location,
        provider: selectedProviderId,
        rootPassword: finalPassword,
        sshKeyId: sshKeyId || null,
        volumeSize: volumeSize || null,
        priceMonthly: Math.round(priceMonthly * 100),
        billingInterval: billingCycle,
        referralCode,
        expiresAt
    })

    return ok(
        c,
        {
            checkoutUrl: checkout.url,
            checkoutId: checkout.id,
            pendingClawId: pendingId,
            expiresAt: expiresAt.toISOString()
        },
        t('api.clawPurchaseInitiated')
    )
})

export default initiateClawPurchase