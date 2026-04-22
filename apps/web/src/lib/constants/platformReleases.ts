// myclaw.one platform release notes — what shipped to the website
// itself, separate from /changelog (which tracks the OpenClaw runtime
// version installed on each claw). Keep entries terse and
// user-facing — link to GitHub release for the full commit log.

export type PlatformReleaseChange = {
    type: 'added' | 'fixed' | 'changed'
    text: string
}

export type PlatformRelease = {
    version: string
    date: string // YYYY-MM-DD
    headline: string
    changes: PlatformReleaseChange[]
    githubUrl?: string
}

const PLATFORM_RELEASES: PlatformRelease[] = [
    {
        version: 'v1.7',
        date: '2026-04-22',
        headline: 'Landing badge actually says v1.4.3',
        githubUrl: 'https://github.com/microblue/myclaw/releases/tag/v1.7',
        changes: [
            {
                type: 'fixed',
                text: 'Landing hero badge + stats column now show desktop v1.4.3 — the i18n strings (landing.badge / landing.statsVersion across 14 languages) were missed in v1.6 and stayed on v1.4.2.'
            }
        ]
    },
    {
        version: 'v1.6',
        date: '2026-04-22',
        headline: 'Desktop v1.4.3 + footer version fix',
        githubUrl: 'https://github.com/microblue/myclaw/releases/tag/v1.6',
        changes: [
            {
                type: 'changed',
                text: 'Desktop download links + /desktop/changelog point at v1.4.3.'
            },
            {
                type: 'fixed',
                text: 'Footer + What\'s new now show the actual current platform tag — the deploy script wasn\'t fetching new tags so git-describe was stuck one release behind.'
            }
        ]
    },
    {
        version: 'v1.5',
        date: '2026-04-22',
        headline: 'PicoClaw + Hermes Agent open-and-chat, background recovery, faster provision',
        githubUrl: 'https://github.com/microblue/myclaw/releases/tag/v1.5',
        changes: [
            {
                type: 'added',
                text: 'PicoClaw open-and-chat: cloud-init pre-seeds the OpenRouter key, default model (google/gemini-2.5-flash-lite) and a myclaw-branded SOUL.md persona, so first-time users land in the launcher with a working chat and a welcome card.'
            },
            {
                type: 'added',
                text: 'Hermes Agent now ships as a third provisionable claw type — Hermes dashboard at /, OpenRouter preconfigured, gateway running as a systemd service from boot.'
            },
            {
                type: 'added',
                text: '"What\'s new" page (/whats-new) surfaced in the landing top nav and the logged-in dashboard header.'
            },
            {
                type: 'added',
                text: 'Background sync scheduler: stuck claws recover on their own — no need to refresh the dashboard for a healthy claw to flip from "configuring" to "running".'
            },
            {
                type: 'fixed',
                text: 'PicoClaw "Open chat" no longer 409s — the launcher requires an explicit password setup before login; cloud-init now seeds it.'
            },
            {
                type: 'fixed',
                text: 'PicoClaw + Hermes provision time cut by ~3-4 minutes (lower poll interval, fewer consecutive-OK requirements before flipping to running).'
            },
            {
                type: 'changed',
                text: 'Wizard claw type picker shows only deployable types (OpenClaw / PicoClaw / Hermes Agent). ZeroClaw and NanoClaw placeholders removed for now.'
            }
        ]
    },
    {
        version: 'v1.4',
        date: '2026-04-22',
        headline: "What's new page + visible release notes link",
        githubUrl: 'https://github.com/microblue/myclaw/releases/tag/v1.4',
        changes: [
            {
                type: 'added',
                text: 'Dedicated /whats-new page listing every platform release. Linked from landing footer and the user dropdown.'
            }
        ]
    },
    {
        version: 'v1.3',
        date: '2026-04-21',
        headline: 'PicoClaw GA + provision hardening',
        githubUrl: 'https://github.com/microblue/myclaw/releases/tag/v1.3',
        changes: [
            {
                type: 'added',
                text: "PicoClaw is live — a sub-10 MB Go runtime that boots on the smallest VPS tier (Lightsail nano, $5/mo). Pick it from the wizard's claw type step."
            },
            {
                type: 'added',
                text: 'One-click sign-in to the PicoClaw launcher: Open chat drops you into the on-box UI authenticated, no token paste.'
            },
            {
                type: 'added',
                text: 'Per-runtime visual badge on dashboard tiles + detail header (OpenClaw blue, PicoClaw emerald) so the type is recognisable at a glance.'
            },
            {
                type: 'added',
                text: 'Logs tab now tails the right systemd unit per claw type — PicoClaw users see launcher logs, not an empty screen.'
            },
            {
                type: 'fixed',
                text: 'Cloud-init no longer trips Lightsail’s 16 KB userData ceiling: stripped comments, measured against the base64-encoded length AWS actually checks.'
            },
            {
                type: 'fixed',
                text: 'Stuck-claw rescue: the 20-min provision timeout now probes the public subdomain before declaring a claw unreachable, so a healthy-but-late-finishing claw is no longer murdered at the deadline.'
            },
            {
                type: 'fixed',
                text: 'DNS race during provision: no more spurious Cloudflare 81058 (“identical record exists”) when the self-heal beat the main create.'
            },
            {
                type: 'fixed',
                text: 'Faster provisioning — once the claw’s gateway answers, the dashboard flips to running in seconds instead of minutes.'
            },
            {
                type: 'fixed',
                text: 'Google / GitHub sign-in works again on local dev (switched to popup; redirect-flow broke under modern third-party-storage rules).'
            },
            {
                type: 'changed',
                text: 'Admin: claw owner reassignment moved from the per-claw detail banner into a clickable owner column on the admin claws list.'
            }
        ]
    },
    {
        version: 'v1.2',
        date: '2026-04-20',
        headline: 'DNS hardening, admin cleanup, navigation refactor',
        githubUrl: 'https://github.com/microblue/myclaw/releases/tag/v1.2',
        changes: [
            {
                type: 'added',
                text: 'Admin settings tab: rotate the platform OpenRouter API key + default model from the UI, no env-var redeploy needed.'
            },
            {
                type: 'added',
                text: 'Hourly DNS reconciler sweeps Cloudflare for orphan records left behind by failed provisions.'
            },
            {
                type: 'fixed',
                text: 'Cloudflare DNS create / update / delete now retries with exponential backoff on transient 5xx — a single network blip no longer leaves a claw stranded with NXDOMAIN.'
            },
            {
                type: 'fixed',
                text: 'WebSocket upgrade headers added to the prod /api/ proxy — terminal + live logs work end-to-end without flapping.'
            },
            {
                type: 'changed',
                text: 'Admin page slimmed from 12 mostly-empty tabs to 6 with real signal each.'
            },
            {
                type: 'changed',
                text: 'Top-bar nav refactor: Dashboard button always visible, redundant items folded into the user dropdown.'
            }
        ]
    },
    {
        version: 'v1.1',
        date: '2026-04-19',
        headline: 'Desktop app changelog, version surfacing, SSH cleanup',
        githubUrl: 'https://github.com/microblue/myclaw/releases/tag/v1.1',
        changes: [
            {
                type: 'added',
                text: 'Dedicated /desktop/changelog page — release-by-release notes for the Mac/Windows desktop app.'
            },
            {
                type: 'added',
                text: 'Footer auto-renders the running platform version, so it’s always clear what build you’re looking at.'
            },
            {
                type: 'changed',
                text: 'Removed the SSH keys management UI — root password + auto-provisioned access cover every real workflow we’ve seen, and the extra UI was a footgun.'
            }
        ]
    },
    {
        version: 'v1.0',
        date: '2026-04-19',
        headline: 'First tagged release',
        githubUrl: 'https://github.com/microblue/myclaw/releases/tag/v1.0',
        changes: [
            {
                type: 'added',
                text: 'Pre-snapshot baseline of myclaw.one as of the v1.0 cut. Earlier history is in the git log; v1.x is what the public site ships.'
            }
        ]
    }
]

export default PLATFORM_RELEASES