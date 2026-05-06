import { Hono } from 'hono'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const app = new Hono()

const installStudio = readFileSync(
    resolve(import.meta.dirname, '../../cloud-scripts/install-studio.sh'),
    'utf-8'
)

app.get('/install-studio', (c) => {
    c.header('Content-Type', 'text/x-shellscript; charset=utf-8')
    return c.body(installStudio)
})

export default app