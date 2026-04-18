// 12 curated Lightsail bundles, all >= 4 GB RAM. ARM bundles are not
// offered by Lightsail in every region (absent in the default AWS
// region here) so this list only uses x86. Mix of Standard + CPU- /
// Memory-optimised to cover the CPU/RAM/disk matrix.
const lightsailCuratedPlans = [
    'medium_3_0',     // Standard · 2 vCPU · 4 GB · 80 GB · $20
    'large_3_0',      // Standard · 2 vCPU · 8 GB · 160 GB · $40
    'xlarge_3_0',     // Standard · 4 vCPU · 16 GB · 320 GB · $80
    '2xlarge_3_0',    // Standard · 8 vCPU · 32 GB · 640 GB · $160
    '4xlarge_3_0',    // Standard · 16 vCPU · 64 GB
    '8xlarge_3_0',    // Standard · 32 vCPU · 128 GB
    'c_large_1_0',    // CPU-Optimized · 4 GB
    'c_xlarge_1_0',   // CPU-Optimized · 8 GB
    'c_2xlarge_1_0',  // CPU-Optimized · 16 GB
    'm_large_1_0',    // Memory-Optimized · 16 GB
    'm_xlarge_1_0',   // Memory-Optimized · 32 GB
    'm_2xlarge_1_0'   // Memory-Optimized · 64 GB
] as const

export default lightsailCuratedPlans