// 4 curated Lightsail bundles, one tier per memory size, all >= 4 GB
// (OpenClaw minMemoryGb). Standard x86 line keeps the curve clean —
// ARM isn't in every AWS region this app cares about. Disk size isn't
// the limiter for OpenClaw.
const lightsailCuratedPlans = [
    'medium_3_0',   // Standard · 2 vCPU · 4 GB · 80 GB · $20
    'large_3_0',    // Standard · 2 vCPU · 8 GB · 160 GB · $40
    'xlarge_3_0',   // Standard · 4 vCPU · 16 GB · 320 GB · $80
    '2xlarge_3_0'   // Standard · 8 vCPU · 32 GB · 640 GB · $160
] as const

export default lightsailCuratedPlans