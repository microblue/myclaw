import type { Context } from 'hono'

const getClientIp = (c: Context): string | null => {
    return (
        c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
        c.req.header('x-real-ip') ||
        null
    )
}

export default getClientIp