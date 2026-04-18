// 12 curated Lightsail bundles: 6 x86 + 6 ARM, spanning the standard
// entry → 2xlarge ladder so users see how price scales with CPU/RAM/disk.
const lightsailCuratedPlans = [
    'nano_3_0',        // x86 · 1 vCPU · 512 MB · 20 GB · $3.50
    'micro_3_0',       // x86 · 1 vCPU · 1 GB · 40 GB · $5
    'small_3_0',       // x86 · 1 vCPU · 2 GB · 60 GB · $10
    'medium_3_0',      // x86 · 2 vCPU · 4 GB · 80 GB · $20
    'large_3_0',       // x86 · 2 vCPU · 8 GB · 160 GB · $40
    'xlarge_3_0',      // x86 · 4 vCPU · 16 GB · 320 GB · $80
    'nano_arm_3_0',    // ARM · 1 vCPU · 512 MB · 20 GB · $3.50
    'micro_arm_3_0',   // ARM · 1 vCPU · 1 GB · 40 GB · $5
    'small_arm_3_0',   // ARM · 1 vCPU · 2 GB · 60 GB · $10
    'medium_arm_3_0',  // ARM · 2 vCPU · 4 GB · 80 GB · $20
    'large_arm_3_0',   // ARM · 2 vCPU · 8 GB · 160 GB · $40
    'xlarge_arm_3_0'   // ARM · 4 vCPU · 16 GB · 320 GB · $80
] as const

export default lightsailCuratedPlans