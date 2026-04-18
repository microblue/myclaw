// 12 curated Hetzner plans spanning Intel shared, AMD shared, ARM, and
// dedicated families so users see a real CPU/RAM/disk matrix rather than
// a linear price ladder of one family.
const hetznerCuratedPlans = [
    'cx23',   // Intel shared · 2 vCPU · 4 GB · 40 GB
    'cx33',   // Intel shared · 4 vCPU · 8 GB · 80 GB
    'cx43',   // Intel shared · 8 vCPU · 16 GB · 160 GB
    'cpx11',  // AMD shared · 2 vCPU · 2 GB · 40 GB
    'cpx21',  // AMD shared · 3 vCPU · 4 GB · 80 GB
    'cpx31',  // AMD shared · 4 vCPU · 8 GB · 160 GB
    'cax11',  // ARM · 2 vCPU · 4 GB · 40 GB
    'cax21',  // ARM · 4 vCPU · 8 GB · 80 GB
    'cax31',  // ARM · 8 vCPU · 16 GB · 160 GB
    'ccx13',  // Dedicated · 2 vCPU · 8 GB · 80 GB
    'ccx23',  // Dedicated · 4 vCPU · 16 GB · 160 GB
    'ccx33'   // Dedicated · 8 vCPU · 32 GB · 240 GB
] as const

export default hetznerCuratedPlans