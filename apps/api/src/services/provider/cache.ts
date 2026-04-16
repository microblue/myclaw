import type { CacheEntry } from '@/ts/Interfaces'

const cache = new Map<string, CacheEntry<unknown>>()

export default cache