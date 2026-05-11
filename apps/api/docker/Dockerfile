# microblue/openclaw-aios — container image of the AI-OS runtime.
#
# Mirrors what install-claw.sh installs at first boot on a VM provider, but
# bakes everything stateless into the image so a Fly machine boots in ~90s
# instead of ~6 min. Per-instance config (SUBDOMAIN / GATEWAY_TOKEN /
# CONFIG_JSON_B64 / OPENROUTER_API_KEY / IE+IT+IR) flows in via env vars at
# container start and is materialised by /usr/local/bin/openclaw-entrypoint.sh.
#
# What lives where:
#   - /opt/openclaw                  npm-installed openclaw runtime (baked)
#   - /openclaw-studio               git-cloned + built MyClaw.One Desktop (baked)
#   - /opt/node_exporter             metrics binary (baked)
#   - /etc/caddy/Caddyfile.template  Caddy config template (baked)
#   - /etc/supervisor/conf.d/        supervisord program defs (baked)
#   - /data                          persistent volume mount (workspace, MEMORY.md, etc.)
#
# Build:
#   docker build -t microblue/openclaw-aios:dev apps/api/docker
# Run (smoke):
#   docker run --rm -e SUBDOMAIN=demo -e DOMAIN=myclaw.one \
#       -e GATEWAY_TOKEN=tok -e CONFIG_JSON_B64=$(echo '{}' | base64) \
#       -p 80:80 -p 443:443 microblue/openclaw-aios:dev

FROM ubuntu:24.04

ARG OPENCLAW_VERSION=2026.4.11
ARG STUDIO_REPO=https://github.com/grp06/openclaw-studio.git
ARG STUDIO_REF=main
ARG NODE_EXPORTER_VERSION=1.8.2
ARG TARGETARCH

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    PATH=/opt/openclaw/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Apt + Node 22 + Caddy + supervisor in one layer. Mirrors install-claw.sh
# stage `apt-base` but skips ufw/sshd (Fly handles firewall + ssh).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl gnupg git dnsutils tini supervisor \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
        | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
        > /etc/apt/sources.list.d/nodesource.list \
    && curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
        | gpg --dearmor -o /etc/apt/keyrings/caddy.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/caddy.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main" \
        > /etc/apt/sources.list.d/caddy.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs caddy \
    && rm -rf /var/lib/apt/lists/*

# Dedicated openclaw user (mirrors install-claw.sh `openclaw-user` stage).
RUN useradd -r -m -d /home/openclaw -s /bin/bash openclaw

# OpenClaw runtime — pinned to the same version install-claw.sh uses so VM
# claws and container claws ship identical gateway behaviour.
RUN mkdir -p /opt/openclaw \
    && chown -R openclaw:openclaw /opt/openclaw \
    && sudo -u openclaw -H npm config set prefix /opt/openclaw \
    && sudo -u openclaw -H npm install -g --prefer-offline --no-audit --no-fund \
        openclaw@${OPENCLAW_VERSION}

# node_exporter for the dashboard's metrics tiles. Same binary install-claw.sh
# pulls; arch-aware so the image builds on amd64 and arm64 hosts.
RUN set -eux; \
    case "${TARGETARCH:-amd64}" in \
        amd64) NE_ARCH=amd64 ;; \
        arm64) NE_ARCH=arm64 ;; \
        *) echo "unsupported arch ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    NE_PKG="node_exporter-${NODE_EXPORTER_VERSION}.linux-${NE_ARCH}"; \
    useradd -r -s /usr/sbin/nologin node_exporter; \
    mkdir -p /opt/node_exporter; \
    curl -fsSL -o /tmp/node_exporter.tgz \
        "https://github.com/prometheus/node_exporter/releases/download/v${NODE_EXPORTER_VERSION}/${NE_PKG}.tar.gz"; \
    tar -xzf /tmp/node_exporter.tgz -C /tmp/; \
    install -o node_exporter -g node_exporter -m 0755 \
        "/tmp/${NE_PKG}/node_exporter" /opt/node_exporter/node_exporter; \
    rm -rf /tmp/node_exporter.tgz "/tmp/${NE_PKG}"

# openclaw-studio — clone + build at image-build time so the production
# `next build` artefacts live inside the image. Avoids the on-VM
# self-bootstrap (5-8 min on a 1-vCPU box) that install-studio.sh has to do.
RUN git clone --depth 1 --branch ${STUDIO_REF} ${STUDIO_REPO} /openclaw-studio \
    && cd /openclaw-studio \
    && grep -rl --include='*.ts' --include='*.tsx' --include='*.js' \
        'OpenClaw Studio' src 2>/dev/null \
        | xargs -r sed -i 's/OpenClaw Studio/MyClaw.One Desktop/g' \
    && npm install --no-audit --no-fund \
    && npm run build \
    && touch /openclaw-studio/.installed

# Stateless config templates + supervisor + entrypoint.
COPY Caddyfile.template /etc/caddy/Caddyfile.template
COPY supervisord.conf /etc/supervisor/supervisord.conf
COPY entrypoint.sh /usr/local/bin/openclaw-entrypoint.sh
RUN chmod +x /usr/local/bin/openclaw-entrypoint.sh

# Seed the agent personality once into the image so a fresh container has
# a usable `main` agent without waiting on a workspace bootstrap. The
# entrypoint copies these into the per-instance volume on first boot
# only — never overwriting user edits.
COPY agent-seed/ /opt/openclaw-seed/

EXPOSE 80 443
VOLUME ["/data"]

# tini reaps zombies; supervisord runs the per-process units (caddy,
# openclaw-gateway, openclaw-studio, node_exporter). The entrypoint
# materialises per-instance config first, then exec-replaces itself
# with supervisord.
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/openclaw-entrypoint.sh"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/supervisord.conf"]
