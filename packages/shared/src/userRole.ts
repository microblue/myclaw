// Three surfaces (per docs/aios-design.md §2):
//   user     — end-user, lands on /aios, manages their own AI-OS
//   admin    — super-admin, lands on /admin, sees everything
//   partner  — channel partner, lands on /partner, sees only own
//              batches/customers, can self-mint up to per-SKU quota
const userRole = {
    user: 'user',
    admin: 'admin',
    partner: 'partner'
} as const

export default userRole