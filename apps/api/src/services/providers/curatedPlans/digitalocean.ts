// 4 curated DigitalOcean droplet slugs, one tier per memory size,
// all >= 4 GB (OpenClaw minMemoryGb). Basic line covers 4/8/16 GB at
// the best price; the 32 GB step jumps to Memory-Optimized so the
// curve stays consistent. Disk size isn't the limiter for OpenClaw.
const digitaloceanCuratedPlans = [
    's-2vcpu-4gb',     // Basic · 2 vCPU · 4 GB · 80 GB · $24
    's-4vcpu-8gb',     // Basic · 4 vCPU · 8 GB · 160 GB · $48
    's-8vcpu-16gb',    // Basic · 8 vCPU · 16 GB · 320 GB · $96
    'm-4vcpu-32gb'     // Memory · 4 vCPU · 32 GB · 100 GB · $168
] as const

export default digitaloceanCuratedPlans