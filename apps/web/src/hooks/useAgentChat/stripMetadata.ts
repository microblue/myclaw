const METADATA_MARKER = 'Conversation info (untrusted metadata):'
const TIMESTAMP_RE =
    /\[(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+\w+\]/

const stripMetadata = (text: string): string => {
    if (!text.includes(METADATA_MARKER)) {
        const tsMatch = text.match(TIMESTAMP_RE)
        if (tsMatch && text.startsWith(tsMatch[0])) {
            return text.substring(tsMatch[0].length).trim()
        }
        return text
    }

    const tsMatch = text.match(TIMESTAMP_RE)
    if (tsMatch) {
        const idx = text.lastIndexOf(tsMatch[0])
        return text.substring(idx + tsMatch[0].length).trim()
    }

    const lines = text.split('\n')
    const markerIdx = lines.findIndex((l) => l.includes(METADATA_MARKER))
    if (markerIdx === -1) return text

    let endIdx = markerIdx + 1
    while (endIdx < lines.length && lines[endIdx].trim() !== '') {
        endIdx++
    }

    return lines.slice(endIdx).join('\n').trim()
}

export default stripMetadata