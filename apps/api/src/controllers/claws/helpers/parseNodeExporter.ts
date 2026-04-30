// Parse the subset of Prometheus exposition format produced by
// node_exporter on each claw. We only consume the collectors we
// actually render in the Overview tab (cpu / meminfo / filesystem /
// loadavg) so this is much smaller than a full Prometheus parser —
// just enough to pick named metrics with optional label filters.

export type NodeExporterSample = {
    cpu: {
        // Cumulative seconds since boot per cpu and mode. Two
        // consecutive samples (>=1s apart) are needed to compute %.
        idleSeconds: number
        busySeconds: number
        cores: number
    }
    memory: {
        totalBytes: number
        // node_memavailable_bytes is what `free` calls "available" —
        // the amount usable without swapping. Better than
        // total - free, which double-counts buffer/cache.
        availableBytes: number
    }
    disk: {
        // Root filesystem only. Multi-mount support would just need
        // an extra label filter; we skip it because the Overview
        // card surfaces "this VPS's primary disk" and the only way
        // to mount additional volumes is through provider-specific
        // flows we don't expose yet.
        totalBytes: number
        availableBytes: number
        mountpoint: string
    }
    loadAvg: {
        one: number
        five: number
        fifteen: number
    }
}

const CPU_BUSY_MODES = new Set([
    'user',
    'nice',
    'system',
    'irq',
    'softirq',
    'steal',
    'iowait'
])

// `name{label1="v1",label2="v2"} 12.345` → name, labels, value.
// Anchored, single-line; the input is line-split before this is
// called.
const METRIC_LINE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+(\S+)$/

const parseLabels = (raw: string): Record<string, string> => {
    const labels: Record<string, string> = {}
    if (!raw) return labels
    // Labels are `name="value"` pairs separated by commas. Values
    // may contain commas inside the quotes, so a naive split fails;
    // regex with quoted-value capture is the safe approach.
    const re = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g
    let m: RegExpExecArray | null
    while ((m = re.exec(raw))) {
        labels[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    }
    return labels
}

const parseNodeExporter = (text: string): NodeExporterSample => {
    let idleSeconds = 0
    let busySeconds = 0
    const seenCpus = new Set<string>()
    let memTotal = 0
    let memAvailable = 0
    let diskTotal = 0
    let diskAvail = 0
    const diskMount = '/'
    let loadOne = 0
    let loadFive = 0
    let loadFifteen = 0

    for (const rawLine of text.split('\n')) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#')) continue
        const m = METRIC_LINE.exec(line)
        if (!m) continue
        const [, name, labelStr, valueStr] = m
        const value = Number(valueStr)
        if (!Number.isFinite(value)) continue
        const labels = labelStr ? parseLabels(labelStr) : {}

        if (name === 'node_cpu_seconds_total') {
            const mode = labels.mode
            if (!mode) continue
            if (labels.cpu) seenCpus.add(labels.cpu)
            if (mode === 'idle') idleSeconds += value
            else if (CPU_BUSY_MODES.has(mode)) busySeconds += value
        } else if (name === 'node_memory_MemTotal_bytes') {
            memTotal = value
        } else if (name === 'node_memory_MemAvailable_bytes') {
            memAvailable = value
        } else if (name === 'node_filesystem_size_bytes') {
            if (labels.mountpoint === diskMount) diskTotal = value
        } else if (name === 'node_filesystem_avail_bytes') {
            if (labels.mountpoint === diskMount) diskAvail = value
        } else if (name === 'node_load1') {
            loadOne = value
        } else if (name === 'node_load5') {
            loadFive = value
        } else if (name === 'node_load15') {
            loadFifteen = value
        }
    }

    return {
        cpu: {
            idleSeconds,
            busySeconds,
            cores: Math.max(seenCpus.size, 1)
        },
        memory: {
            totalBytes: memTotal,
            availableBytes: memAvailable
        },
        disk: {
            totalBytes: diskTotal,
            availableBytes: diskAvail,
            mountpoint: diskMount
        },
        loadAvg: {
            one: loadOne,
            five: loadFive,
            fifteen: loadFifteen
        }
    }
}

export type CpuUsageDelta = {
    usagePct: number
    cores: number
}

// CPU% derived from two cumulative samples. node_exporter exposes
// `node_cpu_seconds_total` per-(cpu,mode); summing busy and idle
// across all cpus and taking the delta gives the cluster-wide
// utilization over the sample window.
export const computeCpuUsage = (
    earlier: NodeExporterSample,
    later: NodeExporterSample
): CpuUsageDelta => {
    const idleDelta = later.cpu.idleSeconds - earlier.cpu.idleSeconds
    const busyDelta = later.cpu.busySeconds - earlier.cpu.busySeconds
    const total = idleDelta + busyDelta
    // Counter reset / no-op window — return 0% rather than NaN. A
    // node_exporter restart between samples is the realistic case.
    if (total <= 0) return { usagePct: 0, cores: later.cpu.cores }
    const pct = (busyDelta / total) * 100
    return {
        usagePct: Math.max(0, Math.min(100, pct)),
        cores: later.cpu.cores
    }
}

export default parseNodeExporter