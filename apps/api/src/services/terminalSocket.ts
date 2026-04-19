import type { Server } from 'http'
import type { ClientChannel } from 'ssh2'

import { WebSocketServer, WebSocket } from 'ws'
import { Client } from 'ssh2'
import { verifyToken } from '@/services/firebase'
import { findUserClaw, isAdmin } from '@/controllers/claws/helpers'

const setupTerminalSocket = (server: Server) => {
    const wss = new WebSocketServer({ noServer: true })

    server.on('upgrade', async (request, socket, head) => {
        try {
            const url = new URL(
                request.url || '',
                `http://${request.headers.host}`
            )
            const match = url.pathname.match(
                /^(?:\/ws)?\/claws\/([^/]+)\/terminal$/
            )

            if (!match) {
                socket.destroy()
                return
            }

            const clawId = match[1]
            const token = url.searchParams.get('token')
            const streamSource = url.searchParams.get('stream')
            const logPath = streamSource ? STREAM_LOG_PATHS[streamSource] : null
            if (streamSource && !logPath) {
                // Unknown stream source — reject rather than fall back
                // to an interactive shell, otherwise a typo in the
                // query param silently gives the client a live root
                // session.
                socket.destroy()
                return
            }

            if (!token) {
                socket.destroy()
                return
            }

            const decoded = await verifyToken(token)

            if (!decoded) {
                socket.destroy()
                return
            }

            const admin = await isAdmin(decoded.uid)
            const claw = await findUserClaw(decoded.uid, clawId, admin)

            if (!claw || !claw.ip || !claw.rootPassword) {
                socket.destroy()
                return
            }

            wss.handleUpgrade(request, socket, head, (ws) => {
                handleConnection(
                    ws,
                    claw.ip!,
                    claw.rootPassword!,
                    logPath ?? undefined
                )
            })
        } catch {
            socket.destroy()
        }
    })
}

const PING_INTERVAL = 5000

// Whitelist of log files we'll stream to the browser. Values are user
// input (query string) so the map is the authorization boundary — no
// path interpolation, no shell metacharacters slip through.
const STREAM_LOG_PATHS: Record<string, string> = {
    bootstrap: '/var/log/openclaw-bootstrap.log',
    gateway: '/var/log/openclaw-gateway.log'
}

const handleConnection = (
    ws: WebSocket,
    ip: string,
    password: string,
    logPath?: string
) => {
    const conn = new Client()
    let sshReady = false

    const pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping()
        }
    }, PING_INTERVAL)

    ws.on('close', () => {
        clearInterval(pingTimer)
    })

    conn.on('ready', () => {
        sshReady = true
        // Two modes share almost all the plumbing — only the channel
        // acquisition and the inbound-message wiring differ.
        //   - logPath set: read-only `tail -F` stream. `-F` follows
        //     across rotations and waits for the file to appear if
        //     cloud-init hasn't created it yet. `-n 500` replays a
        //     bit of history so the tab isn't empty on open. `2>&1`
        //     surfaces "file not yet created" in the output stream.
        //   - logPath absent: interactive shell.
        const onChannel = (
            err: Error | undefined,
            stream: ClientChannel
        ): void => {
            if (err) {
                ws.close()
                conn.end()
                return
            }

            stream.on('data', (data: Buffer) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(data.toString('utf-8'))
                }
            })

            stream.on('close', () => {
                ws.close()
                conn.end()
            })

            if (!logPath) {
                ws.on('message', (msg: Buffer | string) => {
                    const str =
                        typeof msg === 'string' ? msg : msg.toString('utf-8')

                    if (str[0] === '{') {
                        try {
                            const parsed = JSON.parse(str)
                            if (
                                parsed.type === 'resize' &&
                                parsed.cols &&
                                parsed.rows
                            ) {
                                stream.setWindow(parsed.rows, parsed.cols, 0, 0)
                                return
                            }
                        } catch {}
                    }

                    stream.write(str)
                })
            }

            ws.on('close', () => {
                stream.close()
                conn.end()
            })
        }

        if (logPath) {
            conn.exec(`tail -n 500 -F ${logPath} 2>&1`, onChannel)
        } else {
            conn.shell(
                { term: 'xterm-256color', cols: 80, rows: 24 },
                onChannel
            )
        }
    })

    conn.on('error', () => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.close()
        }
    })

    ws.on('close', () => {
        if (sshReady) {
            conn.end()
        }
    })

    conn.connect({
        host: ip,
        port: 22,
        username: 'root',
        password,
        readyTimeout: 10000,
        keepaliveInterval: 15000,
        keepaliveCountMax: 3,
        algorithms: {
            serverHostKey: ['ssh-ed25519', 'ssh-rsa', 'ecdsa-sha2-nistp256']
        }
    })
}

export default setupTerminalSocket