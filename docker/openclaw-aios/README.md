# openclaw-aios

Container image of the AI-OS for Fly.io / self-host. Per
[`docs/aios-design.md`](../../docs/aios-design.md) §10 / §9.5 this is
the third deployment surface alongside the VM-based providers
(Hetzner / Lightsail / DigitalOcean).

## Build

```sh
docker build -t microblue/openclaw-aios:latest docker/openclaw-aios
docker push microblue/openclaw-aios:latest
```

## Run locally

```sh
docker run --rm -p 8443:443 \
  -e ROOT_PASSWORD=PlaceholderRoot123 \
  -e SUBDOMAIN=local-test \
  -e DOMAIN=myclaw.one \
  -e GATEWAY_TOKEN=$(openssl rand -hex 32) \
  -e CONFIG_JSON_B64=$(echo '{"gateway":{}}' | base64 -w0) \
  microblue/openclaw-aios:latest
```

## Deploy on Fly.io

```sh
flyctl apps create my-claw
flyctl secrets set -a my-claw \
  ROOT_PASSWORD=... \
  SUBDOMAIN=my-claw \
  DOMAIN=myclaw.one \
  GATEWAY_TOKEN=... \
  CONFIG_JSON_B64=... \
  OPENROUTER_API_KEY=...
flyctl deploy -a my-claw -i microblue/openclaw-aios:latest
```

The full Fly app config lives in `fly.toml.template` (TODO: wire into
`apps/api/src/services/providers/fly.ts` once the createServer flow is
implemented end-to-end).

## Env contract

Same as `apps/api/cloud-scripts/install-claw.sh` — the wrapper that
`generateCloudInit` emits works against either deployment surface
unchanged:

| Var                  | Required | Notes                                    |
| -------------------- | -------- | ---------------------------------------- |
| `ROOT_PASSWORD`      | yes      | Kept for `flyctl ssh` parity             |
| `SUBDOMAIN`          | yes      | e.g. `cosmic-dune`                       |
| `DOMAIN`             | yes      | e.g. `myclaw.one`                        |
| `GATEWAY_TOKEN`      | yes      | Inbound bearer for openclaw gateway      |
| `CONFIG_JSON_B64`    | yes      | base64-encoded `openclaw.json`           |
| `OPENROUTER_API_KEY` | no       | Built-in LLM bearer                      |
| `IE` / `IT` / `IR`   | no       | install-progress reporter (claws_install_phases) |

## Status

This image is a **scaffolding stub** — the Dockerfile + entrypoint are
in place but have not been built, pushed, or run end-to-end. Real
deploy testing requires a Fly account and is left for a session that
can verify against a live machine.
