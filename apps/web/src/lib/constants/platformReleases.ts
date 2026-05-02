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
        version: 'v1.21.3',
        date: '2026-05-02',
        headline: 'Easy Setup: WeChat connector removed',
        githubUrl: 'https://github.com/microblue/myclaw/releases/tag/v1.21.3',
        changes: [
            {
                type: 'changed',
                text: 'Pulled the Connect WeChat card off the home page and removed the WeChat scan flow entirely. WeChat connection still happens at the OpenClaw runtime level via the openclaw-weixin plugin (CLI: `openclaw channels login --channel openclaw-weixin`); it just isn\'t exposed in the wizard. Shim no longer talks to Tencent\'s ilink endpoints, no longer needs the qrcodejs CDN script, and connects to the gateway with operator.read scope only.'
            }
        ]
    },
    {
        version: 'v1.21.2',
        date: '2026-05-02',
        headline: 'Easy Setup polish — Step 1 / Step 2 big titles, bigger status icons, China Mainland Only badge on WeChat',
        githubUrl: 'https://github.com/microblue/myclaw/releases/tag/v1.21.2',
        changes: [
            {
                type: 'changed',
                text: '"Step 1 · Pick a model" and "Step 2 · Channels Setting" are now real h2 section headings (text-2xl/3xl) above their respective cards instead of small uppercase tags inside them. Cleaner two-step framing at first glance.'
            },
            {
                type: 'changed',
                text: 'Status badges on the home cards bumped from 28×28px to 56×56px. The connected state shows a thicker SVG check (no longer a tiny `&check;`); the not-yet-connected state now shows a clear "broken link" icon in rose instead of an ambiguous amber dot. The pending/checking state keeps its slate dots.'
            },
            {
                type: 'added',
                text: 'The "Connect WeChat" home card and the WeChat scan page both show a 🇨🇳 China Mainland Only pill in rose so users outside the region understand the channel won\'t be reachable for them — Tencent\'s ilink endpoints are mainland-only.'
            },
            {
                type: 'changed',
                text: 'Initial config-load now blocks the page with the same centered-spinner overlay used by save ("Reading your config…"), instead of showing a small inline strip plus disabled cards. Removes the awkward half-rendered state on first paint and prevents accidental clicks on cards that are still resolving their status.'
            }
        ]
    },
    {
        version: 'v1.21.1',
        date: '2026-05-02',
        headline: 'Easy Setup polish — fixed WeChat QR rendering, added save spinner, redesigned the home page',
        githubUrl: 'https://github.com/microblue/myclaw/releases/tag/v1.21.1',
        changes: [
            {
                type: 'fixed',
                text: 'The WeChat QR was rendering as a broken image. Tencent\'s qrcode_img_content field is a URL (e.g. https://liteapp.weixin.qq.com/q/...), not a base64 PNG, so the openclaw-weixin plugin\'s CLI path generates the QR client-side from that URL. The wizard SPA now does the same — added qrcodejs (~13KB CDN) and renders the QR into a 256×256 canvas in the page. Same scan flow as before, just an actual scannable code instead of a 404 image.'
            },
            {
                type: 'added',
                text: 'When you click "Save & restart gateway" (model or Telegram), a full-screen overlay now appears with a centered spinner and "Saving config & restarting OpenClaw gateway. This usually takes ~15 seconds. Please wait…" — blocks accidental clicks during the bounce window so you can\'t double-submit or navigate mid-restart. Goes away the moment /status confirms the gateway is back.'
            },
            {
                type: 'changed',
                text: 'Home page redesigned for a more polished feel: larger header, bigger typography, more breathing room. "Pick a model" is now a full-width Step 1 card. "Connect Telegram" and "Connect WeChat" sit side-by-side under a "Channels" section heading instead of stacking vertically. Subpage headings (Pick a model / Connect Telegram / Connect WeChat / Scan with WeChat) all bumped to match.'
            }
        ]
    },
    {
        version: 'v1.21',
        date: '2026-05-02',
        headline: 'Pick any OpenRouter model in Easy Setup; WeChat QR now appears in seconds, not 8 minutes',
        githubUrl: 'https://github.com/microblue/myclaw/releases/tag/v1.21',
        changes: [
            {
                type: 'changed',
                text: 'The wizard\'s "Pick a model" step still shows five quick-pick presets at the top (DeepSeek, Claude Sonnet, GPT-5, Gemini, Auto-route), but now also includes a custom-ref input below them with autocomplete sourced from openrouter.ai\'s public model catalog (~300 models). Type a name to filter, paste any "openrouter/<provider>/<model>" ref, or browse the full list at openrouter.ai/models. The catalog is fetched on first wizard visit and cached in your browser for 24h, so subsequent visits don\'t re-hit the network. If the catalog fetch fails (offline / rate-limited), the input still works — the openclaw gateway accepts any well-formed ref.'
            },
            {
                type: 'fixed',
                text: 'If your claw\'s currently configured model isn\'t one of the five presets, the wizard now pre-fills it into the custom-ref input instead of showing all radios unchecked. Cleaner display of your existing setup; saving without changing anything no longer overwrites your model with a blank.'
            },
            {
                type: 'fixed',
                text: 'WeChat "Show QR" used to spawn `openclaw channels login --channel openclaw-weixin` as a subprocess, which cold-started for ~5 minutes (jiti TS JIT compile of 40+ runtime deps) plus ~3 minutes of one-time `npm install` to provision plugin-runtime-deps — well past the wizard\'s 30-second timeout, and `child.kill()` left a 414 MB grandchild process tree leaking on every retry. The shim now talks directly to Tencent\'s ilink endpoints (POST /ilink/bot/get_bot_qrcode, GET /ilink/bot/get_qrcode_status long-poll) — same protocol the openclaw-weixin plugin uses internally. Fresh QR appears in ~1 second on first click. On confirmation, the shim writes the account JSON to ~/.openclaw/state/openclaw-weixin/accounts/<id>.json (matching the plugin\'s saveWeixinAccount shape) and calls channels.start over the gateway WS so the running gateway picks it up — no gateway restart, no zombie subprocesses.'
            }
        ]
    },
    {
        version: 'v1.20',
        date: '2026-05-02',
        headline: 'Easy Setup loads in under a second — wizard now hits the gateway directly over WebSocket',
        githubUrl: 'https://github.com/microblue/myclaw/releases/tag/v1.20',
        changes: [
            {
                type: 'fixed',
                text: 'Opening Easy Setup used to sit on a blank page for ~12 seconds before any cards appeared. The wizard\'s shim was running `openclaw gateway call channels.status` every page load, and the openclaw CLI re-loads 40+ plugins via jiti TS JIT on every invocation — about 12s of pure cold-start cost that the user just ate, every time. The shim now opens a direct WebSocket connection to the gateway on loopback (declaring itself as a `gateway-client` backend so it skips device pairing), runs the same `channels.status` RPC, and closes — round-trip is ~600ms. About a 20x speedup.'
            },
            {
                type: 'changed',
                text: 'The wizard SPA now paints the home cards immediately on load instead of blocking on the status fetch. While live channel state is on the wire, you see all three cards (Pick a model / Connect Telegram / Connect WeChat) in a placeholder state with a small "Reading your setup…" spinner above them, then they fill in with real status the instant data arrives.'
            }
        ]
    },
    {
        version: 'v1.19',
        date: '2026-05-01',
        headline: 'Easy Setup is now the default landing page — WeChat works out of the box, wizard is bearer-auth protected',
        githubUrl: 'https://github.com/microblue/myclaw/releases/tag/v1.19',
        changes: [
            {
                type: 'changed',
                text: 'Opening your claw\'s root domain (https://<your-claw>/) now lands on the Easy Setup wizard instead of the OpenClaw Control UI. Caddy 302-redirects / → /myclaw/, with WebSocket upgrade requests excluded from the redirect so the Control UI\'s gateway WS still works after click-through. Click the "Open OpenClaw Web Control" link in the wizard footer to reach the full Control UI (the link carries the gateway token in the URL hash, so you go straight to chat without re-authenticating).'
            },
            {
                type: 'added',
                text: 'WeChat is now pre-installed in cloud-init via Tencent\'s official openclaw-weixin plugin. The wizard\'s WeChat page now shows a real QR code inline — click "Show QR", scan with WeChat on your phone, and the wizard polls until the bind completes. No more "install plugin first" detour. (The QR is fetched by spawning openclaw\'s `channels login` subprocess and scraping the data URL from its stdout, then keeping the subprocess alive to handle the long-poll → save flow.)'
            },
            {
                type: 'fixed',
                text: 'The wizard now requires a bearer token for every API call. The dashboard hands you a tokenized link (/myclaw/#t=<gateway_token>) which the wizard SPA captures into sessionStorage and attaches to every fetch as Authorization: Bearer <…>. Direct visits to /myclaw/ without the token show a "use the dashboard link" landing page instead of letting anyone with the URL change your model or write Telegram credentials.'
            }
        ]
    },
    {
        version: 'v1.18',
        date: '2026-04-30',
        headline: 'New 2-minute setup wizard at /myclaw/ — pick a model + connect a channel without touching the CLI',
        githubUrl: 'https://github.com/microblue/myclaw/releases/tag/v1.18',
        changes: [
            {
                type: 'added',
                text: 'Every fresh claw now exposes a guided setup page at https://<your-claw>/myclaw/ that handles the three things 90% of new users do first: pick a default model (5 OpenRouter presets + bring-your-own-key), connect Telegram (bot token + allowed user IDs), and install the WeChat plugin (Tencent\'s official openclaw-weixin). The wizard talks to a tiny localhost-only Node shim that writes openclaw config + bounces the gateway, so users never have to SSH or open a terminal. The full Control UI is still one click away for advanced configuration.'
            }
        ]
    },
    {
        version: 'v1.17',
        date: '2026-05-01',
        headline: "Channels are visible again — reverting v1.16's disabled-by-default",
        githubUrl: 'https://github.com/microblue/myclaw/releases/tag/v1.17',
        changes: [
            {
                type: 'fixed',
                text: "v1.16 shipped channels (whatsapp/telegram/discord/slack/signal) as `enabled: false` to suppress an 8s/15min health-monitor event-loop spike, but openclaw's Control UI hides `enabled: false` channels from the channels tab — so users couldn't even see them to configure credentials (channels would briefly flash on first render then disappear once the channels.status response came back). Reverted to `enabled: true`. The 8s spike was cosmetic — chat works fine through it — so visibility wins. ma4mzhe7 UX incident, 2026-05-01."
            }
        ]
    },
    {
        version: 'v1.16',
        date: '2026-04-30',
        headline: 'Quieter idle claw — channels ship disabled, no more 15-min event-loop stalls',
        githubUrl: 'https://github.com/microblue/myclaw/releases/tag/v1.16',
        changes: [
            {
                type: 'fixed',
                text: 'Cloud-init was seeding every channel (whatsapp / telegram / discord / slack / signal) as `enabled: true` — a v1.5 workaround to dodge openclaw\'s first-boot normalizer rewrite. openclaw\'s health-monitor then woke each unconfigured channel every ~15 minutes and each restart attempt did ~8 seconds of synchronous TLS-probe + plugin-init work, which still showed up as event-loop stalls in the gateway diagnostics. Channels now ship `enabled: false`; users flip them on from the admin UI when they configure credentials. The original normalizer-rewrite concern is moot now that v1.15\'s `gateway.reload.mode: "off"` makes any internal rewrite a no-op. ma4mzhe7 incident, 2026-04-30.'
            }
        ]
    },
    {
        version: 'v1.15',
        date: '2026-04-30',
        headline: 'New cloud claws stay up — kill the openclaw 12-min self-restart loop',
        githubUrl: 'https://github.com/microblue/myclaw/releases/tag/v1.15',
        changes: [
            {
                type: 'fixed',
                text: 'On a fresh claw, "Open chat" intermittently failed for the first hour or so because openclaw\'s gateway was restarting itself every ~12 minutes. Each internal config write (channel health state, lastTouchedAt re-stamp via stampConfigVersion) was hitting the reload watcher with no rule for `meta.*` and falling through to a full restart, and each restart re-staged plugin runtime deps and pegged the event loop for ~30-60s. Cloud-init now seeds `gateway.reload.mode: "off"` so the watcher dispatch returns early before queueRestart — internal writes still persist, but no longer bounce the process. Trade-off: admin-ui-driven config changes (key rotations, model swaps) need a manual gateway restart to take effect; this is fine for our deployment shape and avoids the restart-loop footgun. ma4mzhe7 incident, 2026-04-30.'
            }
        ]
    },
    {
        version: 'v1.14',
        date: '2026-04-29',
        headline: 'Cloud claws now provision through Caddy — bootstrap fits Lightsail again',
        githubUrl: 'https://github.com/microblue/myclaw/releases/tag/v1.14',
        changes: [
            {
                type: 'fixed',
                text: 'New cloud claws were silently rejected by AWS Lightsail before any IP was allocated — the cloud-init bootstrap had crossed Lightsail\'s 16 KB userData ceiling (after base64) by ~380 bytes, so the DB row stranded as "unreachable" with no provider_server_id. Bootstrap now ships Caddy in place of nginx + certbot: ~10-line Caddyfile with built-in automatic HTTPS, no certbot retry loop. Net script size dropped from 16.8 KB to 14.0 KB base64, ~2.4 KB headroom for future additions. Existing cloud claws keep their nginx + certbot setup; this affects only newly-provisioned ones.'
            },
            {
                type: 'changed',
                text: 'Added a regression test that fails CI if cloud-init ever crosses the Lightsail userData cap again, so this footgun cannot reach production unnoticed.'
            }
        ]
    },
    {
        version: 'v1.13',
        date: '2026-04-29',
        headline: 'New cloud claws no longer brick on a node_exporter download hiccup',
        githubUrl: 'https://github.com/microblue/myclaw/releases/tag/v1.13',
        changes: [
            {
                type: 'fixed',
                text: 'v1.12 added a node_exporter install step that ran inside the bootstrap script under set -eu — so a transient github.com download failure (or a systemd unit parse hiccup) aborted the whole bootstrap before certbot, leaving the claw stuck on "unreachable" with no SSL. Stage is now wrapped in a subshell + soft-fail, and the systemd unit escapes the regex $ as $$ so older systemd versions do not try to expand it. Worst case a new claw still finishes provisioning with chat working; the Overview tab just reads "metrics unavailable".'
            }
        ]
    },
    {
        version: 'v1.12',
        date: '2026-04-29',
        headline: 'Live CPU / Memory / Disk tiles on the instance Overview',
        githubUrl: 'https://github.com/microblue/myclaw/releases/tag/v1.12',
        changes: [
            {
                type: 'added',
                text: 'Instance Overview tab now shows live CPU usage, memory usage, and root-disk usage with progress bars + bytes-used/total subtitles, refreshing every 5 seconds while the claw is running. CPU% is computed from a 1-second sampling window so the value reflects current load, not since-boot average.'
            },
            {
                type: 'changed',
                text: 'New cloud claws ship with a Prometheus node_exporter on a loopback :9100, and an nginx /metrics route gated by the gateway token. Old claws (provisioned before v1.12) display "metrics unavailable — recreate to enable" on the Overview.'
            }
        ]
    },
    {
        version: 'v1.11',
        date: '2026-04-29',
        headline: 'New cloud claws can upgrade themselves from the WebUI',
        githubUrl: 'https://github.com/microblue/myclaw/releases/tag/v1.11',
        changes: [
            {
                type: 'fixed',
                text: 'Click "Update" in a fresh claw\'s Control UI now actually upgrades the runtime. Old provisioning installed OpenClaw under /usr/lib/node_modules (root-owned) while the gateway ran as the unprivileged openclaw user, so npm\'s self-update flow hit EACCES inside its own install dir. New claws install under /opt/openclaw owned end-to-end by the openclaw user. Existing claws keep the old layout.'
            },
            {
                type: 'changed',
                text: 'Bootstrap pinned OpenClaw version bumped to 2026.4.27.'
            }
        ]
    },
    {
        version: 'v1.10',
        date: '2026-04-24',
        headline: 'Desktop product split off to desktop.myclaw.one',
        githubUrl: 'https://github.com/microblue/myclaw/releases/tag/v1.10',
        changes: [
            {
                type: 'changed',
                text: 'Desktop landing, download buttons and changelog have moved to their own site at desktop.myclaw.one. The top-nav "Desktop" toggle now links out, and /desktop + /desktop/changelog on myclaw.one fall through to 404. Main site stays focused on the cloud product.'
            }
        ]
    },
    {
        version: 'v1.9',
        date: '2026-04-23',
        headline: 'Desktop v1.4.4 — reset your OpenClaw data on demand',
        githubUrl: 'https://github.com/microblue/myclaw/releases/tag/v1.9',
        changes: [
            {
                type: 'changed',
                text: 'Desktop download links + /desktop/changelog + landing badge / statsVersion (14 languages) all point at v1.4.4, which adds an opt-in "reset ~/.openclaw" from the app menu and from the Windows installer.'
            }
        ]
    },
    {
        version: 'v1.8',
        date: '2026-04-23',
        headline: 'Comparison table logo no longer a broken image',
        githubUrl: 'https://github.com/microblue/myclaw/releases/tag/v1.8',
        changes: [
            {
                type: 'fixed',
                text: 'Landing "How We\'re Different" table header now shows the MyClaw.One logo + wordmark — the old src pointed at /assets/myclaw-logo-light.png, which never existed in the web public dir, so the header rendered a broken image icon.'
            }
        ]
    },
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