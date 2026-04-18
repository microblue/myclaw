// 12 curated DigitalOcean droplet slugs spanning Basic, CPU-optimized,
// General Purpose, and Memory-optimized. Covers the range a typical user
// compares: cheap entry, balanced, CPU-heavy, memory-heavy.
const digitaloceanCuratedPlans = [
    's-1vcpu-512mb-10gb',   // Basic · 1 vCPU · 512 MB · 10 GB · $4
    's-1vcpu-1gb',          // Basic · 1 vCPU · 1 GB · 25 GB · $6
    's-1vcpu-2gb',          // Basic · 1 vCPU · 2 GB · 50 GB · $12
    's-2vcpu-2gb',          // Basic · 2 vCPU · 2 GB · 60 GB · $18
    's-2vcpu-4gb',          // Basic · 2 vCPU · 4 GB · 80 GB · $24
    's-4vcpu-8gb',          // Basic · 4 vCPU · 8 GB · 160 GB · $48
    'c-2',                  // CPU-Optimized · 2 vCPU · 4 GB · 25 GB · $42
    'c-4',                  // CPU-Optimized · 4 vCPU · 8 GB · 50 GB · $84
    'g-2vcpu-8gb',          // General · 2 vCPU · 8 GB · 25 GB · $63
    'g-4vcpu-16gb',         // General · 4 vCPU · 16 GB · 50 GB · $126
    'm-2vcpu-16gb',         // Memory · 2 vCPU · 16 GB · 50 GB · $84
    'm-4vcpu-32gb'          // Memory · 4 vCPU · 32 GB · 100 GB · $168
] as const

export default digitaloceanCuratedPlans
