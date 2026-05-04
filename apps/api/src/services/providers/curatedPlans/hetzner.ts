// 4 curated Hetzner plans, one tier per memory size, all >= 4 GB
// (OpenClaw minMemoryGb). AMD shared is best price/perf and only
// 4 sizes keeps the deploy/mint UI scannable. Disk size isn't the
// limiter for OpenClaw — CPU + RAM are.
const hetznerCuratedPlans = [
    'cpx21',  // AMD shared · 3 vCPU · 4 GB · 80 GB
    'cpx31',  // AMD shared · 4 vCPU · 8 GB · 160 GB
    'cpx41',  // AMD shared · 8 vCPU · 16 GB · 240 GB
    'cpx51'   // AMD shared · 16 vCPU · 32 GB · 360 GB
] as const

export default hetznerCuratedPlans