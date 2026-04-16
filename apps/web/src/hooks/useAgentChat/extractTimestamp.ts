const GATEWAY_TS_RE =
    /\[(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(\w+)\]/

const CURRENT_TIME_RE =
    /Current time:\s+\w+,\s+(\w+)\s+(\d{1,2})(?:st|nd|rd|th),\s+(\d{4})\s*[—–-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*\((\w+)\)/i

const MONTHS: Record<string, string> = {
    January: '01',
    February: '02',
    March: '03',
    April: '04',
    May: '05',
    June: '06',
    July: '07',
    August: '08',
    September: '09',
    October: '10',
    November: '11',
    December: '12'
}

const tryParseGatewayTs = (text: string): string | null => {
    const match = text.match(GATEWAY_TS_RE)
    if (!match) return null

    const [, date, time] = match

    try {
        const parsed = new Date(`${date}T${time}:00Z`)
        if (!isNaN(parsed.getTime())) return parsed.toISOString()
    } catch {}

    return null
}

const tryParseCurrentTime = (text: string): string | null => {
    const match = text.match(CURRENT_TIME_RE)
    if (!match) return null

    const [, monthName, day, year, rawHour, minute, ampm] = match
    const month = MONTHS[monthName]
    if (!month) return null

    let hour = parseInt(rawHour, 10)
    if (ampm.toUpperCase() === 'PM' && hour !== 12) hour += 12
    if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0

    const pad = (n: number): string => n.toString().padStart(2, '0')

    try {
        const iso = `${year}-${month}-${pad(parseInt(day, 10))}T${pad(hour)}:${minute}:00Z`
        const parsed = new Date(iso)
        if (!isNaN(parsed.getTime())) return parsed.toISOString()
    } catch {}

    return null
}

const extractTimestamp = (text: string): string | null => {
    return tryParseGatewayTs(text) ?? tryParseCurrentTime(text)
}

export default extractTimestamp