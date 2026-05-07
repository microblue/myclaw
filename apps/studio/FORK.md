# openclaw-studio (myclaw fork)

This directory is a vendored fork of [grp06/openclaw-studio][upstream]
imported into the myclaw monorepo per
[`docs/aios-design.md`](../../docs/aios-design.md) §9.5 / PRE-3.

## Why a fork

Studio is the chat UI that runs **on each claw VPS**. The myclaw SPA at
`https://myclaw.one` needs to call into Studio over HTTPS to render the
three-pane Intent UI (chat / outline / artifacts). Doing that requires
endpoints + auth + CORS that aren't in upstream:

- `GET /api/myclaw/intents/[id]/messages` — paginated chat log
- `GET /api/myclaw/intents/[id]/outline` — outline computed from messages
- Supabase JWT middleware that validates the SPA's session against
  the cached JWKS for the configured Supabase project
- CORS allow `https://myclaw.one`

We could ship these as a patch series on upstream, but the changes are
specific enough to our SaaS (Supabase auth, myclaw.one origin) that a
maintained fork is simpler than an open-PR loop.

## Imported from

- Upstream: `https://github.com/grp06/openclaw-studio`
- Imported at commit: `b7209d5` (2026-03-18 — "Fix localhost gateway
  handshake for Studio")
- License: MIT (preserved unchanged in `./LICENSE`)

## Sync policy

We pull selective upstream changes manually — there is no automatic
merge. To pull a specific upstream commit:

```sh
cd /tmp && git clone https://github.com/grp06/openclaw-studio.git upstream-studio
cd upstream-studio && git format-patch <last-merged-sha>..HEAD --stdout > /tmp/upstream.patch
cd /home/dz/myclaw/apps/studio && git apply --3way /tmp/upstream.patch
```

Anything we add under `src/app/api/myclaw/**`, the JWT middleware, or
the CORS allowlist is fork-specific — upstream PR submissions for
generic fixes are welcome but optional.

## How it's deployed onto a claw

Today the `oc-stu-i.service` systemd unit (rendered by
`apps/api/cloud-scripts/install-studio.sh`) does:

```sh
npm install -g openclaw-studio@latest
```

That still installs the **upstream** npm package. Once we want our
fork live on production claws we have two options:

1. **Publish under a private scope**: `npm publish --access restricted
   @microblue/openclaw-studio`, update install-studio.sh to install
   our scope. Cleanest for users who run `flyctl deploy ...` against
   our image.
2. **Build inline from this directory**: have install-studio.sh `git
   clone https://github.com/microblue/myclaw && cp -r apps/studio
   /opt/openclaw-studio && cd /opt/openclaw-studio && npm install
   --omit=dev && npm run build`. Slower bootstrap but no separate
   publish step.

Both are valid; option 1 is preferred because it keeps the install
path identical to the upstream UX. **Neither is wired up yet** — the
fork just sits in this directory until we make the call.

[upstream]: https://github.com/grp06/openclaw-studio
