import type { AuthenticatedContext } from '@/ts/Types'

import { eq, desc } from 'drizzle-orm'
import { db } from '@/db'
import { sshKeys } from '@/db/schema'
import { ok } from '@/lib/response'
import { t } from '@openclaw/i18n'

const getSSHKeys = async (c: AuthenticatedContext) => {
    const userId = c.get('userId')

    const keys = await db
        .select({
            id: sshKeys.id,
            name: sshKeys.name,
            fingerprint: sshKeys.fingerprint,
            publicKey: sshKeys.publicKey,
            createdAt: sshKeys.createdAt
        })
        .from(sshKeys)
        .where(eq(sshKeys.userId, userId))
        .orderBy(desc(sshKeys.createdAt))

    return ok(c, keys, t('api.sshKeysFetched'))
}

export default getSSHKeys