import type { BlogPostMeta } from '@/ts/Interfaces'

import allPosts from '@/lib/blog/allPosts'

const getPostMeta = (slug: string): BlogPostMeta | null => {
    return allPosts.find((p) => p.slug === slug) ?? null
}

export default getPostMeta