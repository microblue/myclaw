import type { FC } from 'react'

import useClawMetrics from '@/hooks/useClaws/useClawMetrics'

interface Props {
    clawId: string
    enabled: boolean
}

const formatBytes = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let i = 0
    let n = bytes
    while (n >= 1024 && i < units.length - 1) {
        n /= 1024
        i++
    }
    // 1 decimal once we cross the KB boundary so 1.5 GB doesn't
    // round to "2 GB" on a 2 GB box. Bytes integer for clarity.
    return i === 0 ? `${Math.round(n)} ${units[i]}` : `${n.toFixed(1)} ${units[i]}`
}

const Tile: FC<{
    label: string
    pct: number | null
    subtitle: string
    accent: string
}> = ({ label, pct, subtitle, accent }) => {
    // pct=null = unavailable / loading. Bar stays dim, % cell shows '—'.
    const display = pct === null ? '—' : `${pct.toFixed(0)}%`
    const width = pct === null ? 0 : Math.max(0, Math.min(100, pct))
    return (
        <div className='bg-card rounded-lg border p-4'>
            <div className='flex items-baseline justify-between'>
                <p className='text-muted-foreground text-xs uppercase tracking-wide'>
                    {label}
                </p>
                <p className='text-lg font-semibold tabular-nums'>{display}</p>
            </div>
            <div className='bg-muted relative mt-2 h-2 overflow-hidden rounded'>
                <div
                    className={`h-full rounded transition-[width] duration-700 ease-out ${accent}`}
                    style={{ width: `${width}%` }}
                />
            </div>
            <p className='text-muted-foreground mt-1.5 text-xs'>{subtitle}</p>
        </div>
    )
}

const ClawMetricsTiles: FC<Props> = ({ clawId, enabled }) => {
    const { data, isLoading, isError } = useClawMetrics(clawId, enabled)

    // Three tiles always render — keeps the Overview layout stable
    // while the first sample is in flight (web fetches on mount,
    // api needs ~2.5s for the two-sample CPU window).
    if (!enabled) {
        return (
            <Empty
                title='Metrics paused'
                detail='Live system metrics resume when this instance is running.'
            />
        )
    }
    if (isLoading) {
        return (
            <section className='grid gap-4 sm:grid-cols-3'>
                <Tile label='CPU' pct={null} subtitle='Loading…' accent='bg-muted-foreground/30' />
                <Tile label='Memory' pct={null} subtitle='Loading…' accent='bg-muted-foreground/30' />
                <Tile label='Disk' pct={null} subtitle='Loading…' accent='bg-muted-foreground/30' />
            </section>
        )
    }
    if (isError || !data) {
        return (
            <Empty
                title='Metrics unavailable'
                detail='Could not reach this instance for live system metrics. Will retry automatically.'
            />
        )
    }
    if (!data.available) {
        const reason = describeUnavailable(data.reason)
        return <Empty title='Metrics unavailable' detail={reason} />
    }

    const cpuSubtitle = `${data.cpu.cores} core${data.cpu.cores === 1 ? '' : 's'} · load ${data.loadAvg.one.toFixed(2)}`
    const memSubtitle = `${formatBytes(data.memory.usedBytes)} of ${formatBytes(data.memory.totalBytes)}`
    const diskSubtitle = `${formatBytes(data.disk.usedBytes)} of ${formatBytes(data.disk.totalBytes)} on ${data.disk.mountpoint}`

    return (
        <section className='grid gap-4 sm:grid-cols-3'>
            <Tile label='CPU' pct={data.cpu.usagePct} subtitle={cpuSubtitle} accent={tone(data.cpu.usagePct)} />
            <Tile label='Memory' pct={data.memory.usedPct} subtitle={memSubtitle} accent={tone(data.memory.usedPct)} />
            <Tile label='Disk' pct={data.disk.usedPct} subtitle={diskSubtitle} accent={tone(data.disk.usedPct)} />
        </section>
    )
}

const tone = (pct: number): string => {
    if (pct >= 90) return 'bg-red-500'
    if (pct >= 75) return 'bg-amber-500'
    return 'bg-green-500'
}

// Old claws (provisioned before v1.12) were never given the
// node_exporter + nginx /metrics route, so the api will land on
// metrics_endpoint_unreachable forever. Tell the user instead of
// looping the spinner.
const describeUnavailable = (
    reason:
        | 'claw_not_provisioned'
        | 'metrics_endpoint_unreachable'
        | 'metrics_unauthorized'
        | 'metrics_parse_error'
): string => {
    switch (reason) {
        case 'claw_not_provisioned':
            return 'This instance has not finished provisioning yet. Metrics will appear once it is running.'
        case 'metrics_endpoint_unreachable':
            return 'No metrics endpoint detected on this instance. Instances created before v1.12 do not ship the metrics agent — recreate the instance to enable live metrics.'
        case 'metrics_unauthorized':
            return "The api could not authenticate to this instance's metrics endpoint."
        case 'metrics_parse_error':
            return "Metrics endpoint returned data the api couldn't parse."
    }
}

const Empty: FC<{ title: string; detail: string }> = ({ title, detail }) => (
    <section className='bg-card rounded-lg border p-6'>
        <p className='text-sm font-medium'>{title}</p>
        <p className='text-muted-foreground mt-1 text-xs'>{detail}</p>
    </section>
)

export default ClawMetricsTiles