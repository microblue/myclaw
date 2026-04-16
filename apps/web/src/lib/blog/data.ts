import type { BlogPostModule } from '@/ts/Interfaces'

const postModules = import.meta.glob<BlogPostModule>(
    '../../../content/posts/*.mdx',
    {
        eager: true
    }
)

const moduleEntries: [string, BlogPostModule][] = Object.entries(postModules)

export default moduleEntries