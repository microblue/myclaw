import parseNodeExporter, {
    computeCpuUsage
} from '@/controllers/claws/helpers/parseNodeExporter'

const SAMPLE = `
# HELP node_cpu_seconds_total Seconds the CPUs spent in each mode.
# TYPE node_cpu_seconds_total counter
node_cpu_seconds_total{cpu="0",mode="idle"} 1000
node_cpu_seconds_total{cpu="0",mode="user"} 100
node_cpu_seconds_total{cpu="0",mode="system"} 50
node_cpu_seconds_total{cpu="0",mode="iowait"} 10
node_cpu_seconds_total{cpu="0",mode="nice"} 0
node_cpu_seconds_total{cpu="0",mode="irq"} 0
node_cpu_seconds_total{cpu="0",mode="softirq"} 5
node_cpu_seconds_total{cpu="0",mode="steal"} 0
node_cpu_seconds_total{cpu="1",mode="idle"} 900
node_cpu_seconds_total{cpu="1",mode="user"} 80
node_cpu_seconds_total{cpu="1",mode="system"} 40
node_cpu_seconds_total{cpu="1",mode="iowait"} 5
node_cpu_seconds_total{cpu="1",mode="nice"} 0
node_cpu_seconds_total{cpu="1",mode="irq"} 0
node_cpu_seconds_total{cpu="1",mode="softirq"} 3
node_cpu_seconds_total{cpu="1",mode="steal"} 0

# HELP node_memory_MemTotal_bytes Memory information field MemTotal_bytes.
node_memory_MemTotal_bytes 2.06311424e+09
node_memory_MemAvailable_bytes 1.5e+09
node_memory_MemFree_bytes 1.0e+09

# HELP node_filesystem_size_bytes Filesystem size in bytes.
node_filesystem_size_bytes{device="/dev/root",fstype="ext4",mountpoint="/"} 8.123e+10
node_filesystem_size_bytes{device="tmpfs",fstype="tmpfs",mountpoint="/run"} 5.0e+08
node_filesystem_avail_bytes{device="/dev/root",fstype="ext4",mountpoint="/"} 6.5e+10
node_filesystem_avail_bytes{device="tmpfs",fstype="tmpfs",mountpoint="/run"} 4.9e+08

# HELP node_load1 1m load average.
node_load1 0.5
node_load5 0.75
node_load15 1.2
`

describe('parseNodeExporter', () => {
    const out = parseNodeExporter(SAMPLE)

    it('aggregates CPU idle + busy seconds across all cpus and modes', () => {
        // idle: 1000 + 900 = 1900
        expect(out.cpu.idleSeconds).toBe(1900)
        // busy: (100+50+10+0+0+5+0) + (80+40+5+0+0+3+0) = 165 + 128 = 293
        expect(out.cpu.busySeconds).toBe(293)
        expect(out.cpu.cores).toBe(2)
    })

    it('reads memory bytes from MemTotal + MemAvailable (not MemFree)', () => {
        expect(out.memory.totalBytes).toBe(2_063_114_240)
        expect(out.memory.availableBytes).toBe(1_500_000_000)
    })

    it('picks only the / filesystem, ignoring tmpfs and other mounts', () => {
        expect(out.disk.mountpoint).toBe('/')
        expect(out.disk.totalBytes).toBe(81_230_000_000)
        expect(out.disk.availableBytes).toBe(65_000_000_000)
    })

    it('reads loadavg 1/5/15', () => {
        expect(out.loadAvg.one).toBe(0.5)
        expect(out.loadAvg.five).toBe(0.75)
        expect(out.loadAvg.fifteen).toBe(1.2)
    })

    it('skips comment lines and blank lines without throwing', () => {
        const noisy = '# just a comment\n\n# HELP foo bar\nnode_load1 0.42\n'
        const r = parseNodeExporter(noisy)
        expect(r.loadAvg.one).toBe(0.42)
    })

    it('treats single-CPU box as 1 core, not 0', () => {
        const r = parseNodeExporter('node_load1 0\n')
        expect(r.cpu.cores).toBe(1)
    })
})

describe('computeCpuUsage', () => {
    const at = (idle: number, busy: number, cores = 2): ReturnType<typeof parseNodeExporter> => ({
        cpu: { idleSeconds: idle, busySeconds: busy, cores },
        memory: { totalBytes: 0, availableBytes: 0 },
        disk: { totalBytes: 0, availableBytes: 0, mountpoint: '/' },
        loadAvg: { one: 0, five: 0, fifteen: 0 }
    })

    it('computes 50% when half the delta is busy', () => {
        const t0 = at(1000, 1000)
        const t1 = at(1100, 1100)
        const r = computeCpuUsage(t0, t1)
        expect(r.usagePct).toBe(50)
        expect(r.cores).toBe(2)
    })

    it('computes 0% when only idle advances', () => {
        const t0 = at(1000, 200)
        const t1 = at(1100, 200)
        expect(computeCpuUsage(t0, t1).usagePct).toBe(0)
    })

    it('computes 100% when only busy advances', () => {
        const t0 = at(1000, 200)
        const t1 = at(1000, 300)
        expect(computeCpuUsage(t0, t1).usagePct).toBe(100)
    })

    it('returns 0 (not NaN) on counter reset / no-op window', () => {
        const same = at(1000, 200)
        expect(computeCpuUsage(same, same).usagePct).toBe(0)
        // counter went backward (node_exporter restart)
        const t1 = at(500, 100)
        expect(computeCpuUsage(same, t1).usagePct).toBe(0)
    })

    it('clamps to [0, 100]', () => {
        // shouldn't happen with a correct exporter, but guard anyway
        const t0 = at(0, 0)
        const t1 = at(-50, 200)
        const r = computeCpuUsage(t0, t1)
        expect(r.usagePct).toBeGreaterThanOrEqual(0)
        expect(r.usagePct).toBeLessThanOrEqual(100)
    })
})