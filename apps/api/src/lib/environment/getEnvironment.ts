import type { Context } from 'hono'
import type { Environment } from '@/ts/Types'

import DEV from '@/lib/environment/DEV'
import PROD from '@/lib/environment/PROD'

const client = process.env.CLIENT || ''
const isLocalServer =
    client.includes('localhost') || client.includes('127.0.0.1')

const getEnvironment = (_c: Context): Environment => {
    return isLocalServer ? DEV : PROD
}

export default getEnvironment