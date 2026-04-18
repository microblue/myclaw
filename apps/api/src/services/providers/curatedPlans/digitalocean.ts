// 12 curated DigitalOcean droplet slugs, all >= 4 GB RAM. Spans Basic
// (starts at 4 GB), CPU-Optimized, General Purpose, and
// Memory-Optimized so users can compare classes in the same grid.
const digitaloceanCuratedPlans = [
    's-2vcpu-4gb',          // Basic · 2 vCPU · 4 GB · 80 GB · $24
    's-2vcpu-4gb-intel',    // Basic Intel · 2 vCPU · 4 GB · 80 GB
    's-4vcpu-8gb',          // Basic · 4 vCPU · 8 GB · 160 GB · $48
    's-4vcpu-8gb-intel',    // Basic Intel · 4 vCPU · 8 GB · 160 GB
    's-8vcpu-16gb',         // Basic · 8 vCPU · 16 GB · 320 GB
    'c-2',                  // CPU-Optimized · 2 vCPU · 4 GB · 25 GB · $42
    'c-4',                  // CPU-Optimized · 4 vCPU · 8 GB · 50 GB · $84
    'c-8',                  // CPU-Optimized · 8 vCPU · 16 GB · 100 GB
    'g-2vcpu-8gb',          // General · 2 vCPU · 8 GB · 25 GB · $63
    'g-4vcpu-16gb',         // General · 4 vCPU · 16 GB · 50 GB · $126
    'm-2vcpu-16gb',         // Memory · 2 vCPU · 16 GB · 50 GB · $84
    'm-4vcpu-32gb'          // Memory · 4 vCPU · 32 GB · 100 GB · $168
] as const

export default digitaloceanCuratedPlans