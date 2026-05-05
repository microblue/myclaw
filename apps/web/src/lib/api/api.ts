import admin from '@/lib/api/admin'
import affiliate from '@/lib/api/affiliate'
import claws from '@/lib/api/claws'
import plans from '@/lib/api/plans'
import providers from '@/lib/api/providers'
import users from '@/lib/api/users'
import waitlist from '@/lib/api/waitlist'

const api = {
    ...plans,
    ...providers,
    ...claws,
    ...affiliate,
    ...admin,
    ...users,
    ...waitlist
}

export default api