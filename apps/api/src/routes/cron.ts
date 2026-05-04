import { Hono } from 'hono'
import {
    generateBlogPost,
    sendFeatureEmails,
    cleanupExpiredClaws
} from '@/controllers/cron'
import { fail } from '@/lib/response'
import { t } from '@openclaw/i18n'

const app = new Hono()

app.use('*', async (c, next) => {
    const secret = c.req.header('Authorization')?.replace('Bearer ', '')

    if (!secret || secret !== process.env.CRON_SECRET)
        return fail(c, t('api.unauthorized'), 401)

    return next()
})

app.get('/generate-blog-post', generateBlogPost)
app.get('/send-feature-emails', sendFeatureEmails)
app.get('/cleanup-expired-claws', cleanupExpiredClaws)

export default app