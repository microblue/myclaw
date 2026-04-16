import type { ComponentType } from 'react'

import moduleEntries from '@/lib/blog/data'

const getPostComponent = (slug: string): ComponentType | null => {
    const entry = moduleEntries.find(([, mod]) => mod.frontmatter.slug === slug)
    return entry?.[1].default ?? null
}

export default getPostComponent