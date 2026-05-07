import { Hono } from 'hono'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const app = new Hono()

const installStudio = readFileSync(
    resolve(import.meta.dirname, '../../cloud-scripts/install-studio.sh'),
    'utf-8'
)

// install-claw.sh is the AI-OS installer (P2a — extracted from the
// inline cloud-init bash that used to live in generateCloudInit.ts).
// Cloud-init's userData is now a tiny wrapper that exports the
// per-claw env vars and curl|bash's this URL, which keeps the
// rendered userData well under Lightsail's 16 KB cap and lets us
// iterate the installer without re-rendering every claw's cloud-init.
const installClaw = readFileSync(
    resolve(import.meta.dirname, '../../cloud-scripts/install-claw.sh'),
    'utf-8'
)

app.get('/install-studio', (c) => {
    c.header('Content-Type', 'text/x-shellscript; charset=utf-8')
    return c.body(installStudio)
})

app.get('/install-claw', (c) => {
    c.header('Content-Type', 'text/x-shellscript; charset=utf-8')
    return c.body(installClaw)
})

export default app