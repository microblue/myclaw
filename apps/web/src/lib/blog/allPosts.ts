import type { BlogPostMeta, BlogPostModule } from '@/ts/Interfaces'

import moduleEntries from '@/lib/blog/data'

const estimateReadingTime = (description: string): number => {
    const descWords = description.split(/\s+/).length
    const estimatedTotal = Math.round(descWords * 20)
    return Math.max(1, Math.round(estimatedTotal / 200))
}

const buildPostMeta = (mod: BlogPostModule): BlogPostMeta => ({
    ...mod.frontmatter,
    readingTime: estimateReadingTime(mod.frontmatter.description)
})

const allPosts: BlogPostMeta[] = moduleEntries
    .map(([, mod]) => buildPostMeta(mod))
    .sort(
        (a, b) =>
            new Date(b.publishedAt).getTime() -
            new Date(a.publishedAt).getTime()
    )

export default allPosts