// 12 curated Hetzner plans, all >= 4 GB RAM (matches
// inputValidation.MIN_MEMORY_GB.MIN so every visible plan is
// installable). Mixes Intel shared, AMD shared, ARM shared, and
// dedicated families to give users a real CPU/RAM/disk matrix.
const hetznerCuratedPlans = [
    'cx23',   // Intel shared · 2 vCPU · 4 GB · 40 GB
    'cx33',   // Intel shared · 4 vCPU · 8 GB · 80 GB
    'cx43',   // Intel shared · 8 vCPU · 16 GB · 160 GB
    'cpx21',  // AMD shared · 3 vCPU · 4 GB · 80 GB
    'cpx31',  // AMD shared · 4 vCPU · 8 GB · 160 GB
    'cpx41',  // AMD shared · 8 vCPU · 16 GB · 240 GB
    'cax11',  // ARM · 2 vCPU · 4 GB · 40 GB
    'cax21',  // ARM · 4 vCPU · 8 GB · 80 GB
    'cax31',  // ARM · 8 vCPU · 16 GB · 160 GB
    'ccx13',  // Dedicated · 2 vCPU · 8 GB · 80 GB
    'ccx23',  // Dedicated · 4 vCPU · 16 GB · 160 GB
    'ccx33'   // Dedicated · 8 vCPU · 32 GB · 240 GB
] as const

export default hetznerCuratedPlans
