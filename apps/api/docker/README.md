# openclaw-aios container image

Image: `microblue/openclaw-aios`

Mirrors what `apps/api/cloud-scripts/install-claw.sh` installs on a fresh VM,
but baked into a Docker image so a Fly.io machine boots in ~90s instead of
~6 min. Used by the `kind: 'container'` provider path
(`apps/api/src/services/providers/fly.ts`).

## Build

```bash
cd apps/api/docker
docker build -t microblue/openclaw-aios:dev .
```

The build clones `https://github.com/grp06/openclaw-studio` and runs
`npm run build`, so the first build takes ~5–8 min. Subsequent builds reuse
the layer unless `STUDIO_REF` changes.

## Smoke test

```bash
docker run --rm \
    -e SUBDOMAIN=demo \
    -e DOMAIN=myclaw.one \
    -e GATEWAY_TOKEN=tok \
    -e CONFIG_JSON_B64=$(echo '{}' | base64) \
    -p 80:80 -p 443:443 \
    microblue/openclaw-aios:dev
```

Expect: gateway answering on `:18789` and studio on `:3000` within ~30s.
Caddy will fail to issue a cert without a real DNS A record, but you can
hit `http://localhost` to see the Studio shell.

## Per-instance env vars

| Var                 | Required | Source                                            |
| ------------------- | -------- | ------------------------------------------------- |
| `SUBDOMAIN`         | yes      | `claws.subdomain`                                 |
| `DOMAIN`            | yes      | `myclaw.one`                                      |
| `GATEWAY_TOKEN`     | yes      | `claws.gatewayToken`                              |
| `CONFIG_JSON_B64`   | yes      | base64 of openclaw.json                           |
| `OPENROUTER_API_KEY`| no       | `system_settings.defaultOpenrouterApiKey`         |
| `IE` / `IT` / `IR`  | no       | install-progress reporter URL / token / runId     |

## Layout inside the container

| Path                      | Description                                    |
| ------------------------- | ---------------------------------------------- |
| `/opt/openclaw`           | npm-installed openclaw runtime (baked)         |
| `/openclaw-studio`        | git-cloned + built MyClaw.One Control Panel (baked)  |
| `/opt/node_exporter`      | metrics binary (baked)                         |
| `/opt/openclaw-seed/`     | first-boot agent personality seed (baked)      |
| `/etc/caddy/Caddyfile.template` | rendered to `/etc/caddy/Caddyfile` at start |
| `/etc/supervisor/`        | program defs for caddy / gateway / studio / node_exporter |
| `/data`                   | persistent volume mount (workspace, MEMORY.md) |

## CI

`.github/workflows/docker-aios.yml` builds and pushes on `main` with tags
`latest` and `<git sha>`. Requires repo secrets `DOCKERHUB_USER` and
`DOCKERHUB_TOKEN`.
