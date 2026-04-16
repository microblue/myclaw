import crypto from 'crypto'

const verifyWebhookSignature = (
    payload: string,
    webhookId: string,
    timestamp: string,
    signatureHeader: string,
    secret: string
): boolean => {
    const signedContent = `${webhookId}.${timestamp}.${payload}`

    const secretVariants = [
        Buffer.from(secret),
        secret.startsWith('polar_whs_')
            ? Buffer.from(secret.slice(10), 'base64')
            : null,
        secret.startsWith('whsec_')
            ? Buffer.from(secret.slice(6), 'base64')
            : null,
        Buffer.from(secret, 'base64'),
        secret.startsWith('polar_whs_') ? Buffer.from(secret.slice(10)) : null
    ].filter(Boolean) as Buffer[]

    const receivedSigs = signatureHeader
        .split(' ')
        .filter((s) => s.startsWith('v1,'))
        .map((s) => s.slice(3))

    for (const secretBytes of secretVariants) {
        const expectedSignature = crypto
            .createHmac('sha256', secretBytes)
            .update(signedContent)
            .digest('base64')

        for (const received of receivedSigs) {
            try {
                if (
                    crypto.timingSafeEqual(
                        Buffer.from(received),
                        Buffer.from(expectedSignature)
                    )
                ) {
                    return true
                }
            } catch {}
        }
    }

    return false
}

export default verifyWebhookSignature