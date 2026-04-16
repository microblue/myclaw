import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { rateLimits } from '@/db/schema'

const clearRateLimit = async (...keys: string[]): Promise<void> => {
    await Promise.all(
        keys.map((key) => db.delete(rateLimits).where(eq(rateLimits.key, key)))
    )
}

export default clearRateLimit