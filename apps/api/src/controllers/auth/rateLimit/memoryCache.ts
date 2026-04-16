const RATE_LIMIT_WINDOW = 60_000

const memoryCache = new Map<string, number>()

setInterval(
    () => {
        const cutoff = Date.now() - RATE_LIMIT_WINDOW * 2
        for (const [key, ts] of memoryCache) {
            if (ts < cutoff) memoryCache.delete(key)
        }
    },
    10 * 60 * 1000
)

export default memoryCache