# openclaw-aios — container image of the AI-OS for Fly.io / self-host.
#
# Same install-claw.sh as the VM path, but baked at image-build time
# instead of run at boot. Per-instance config still flows in as env
# vars (ROOT_PASSWORD, SUBDOMAIN, DOMAIN, GATEWAY_TOKEN,
# CONFIG_JSON_B64, optional IE/IT/IR), consumed by entrypoint.sh.
#
# Build: docker build -t microblue/openclaw-aios:latest .
# Push:  docker push microblue/openclaw-aios:latest
# Run:   docker run --rm -e ROOT_PASSWORD=... -e SUBDOMAIN=... ...
#
# Image size goal: <500 MB. We start from debian:stable-slim and
# install only what install-claw.sh actually needs at runtime
# (node, caddy, openclaw npm package, chromium for the browser tool).
# The build-time apt fetches that install-claw.sh would do at boot
# happen here once, so the running container starts in seconds.

FROM debian:stable-slim AS base

ENV DEBIAN_FRONTEND=noninteractive

# Same key + apt setup install-claw.sh does. Using `--no-install-recommends`
# trims ~150 MB off the image.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates gnupg git dnsutils \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /etc/apt/keyrings && \
    curl -fsSL -o /etc/apt/keyrings/nodesource.gpg.key https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key && \
    gpg --dearmor --batch --yes -o /etc/apt/keyrings/nodesource.gpg /etc/apt/keyrings/nodesource.gpg.key && \
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list && \
    curl -fsSL -o /etc/apt/keyrings/caddy.gpg.key https://dl.cloudsmith.io/public/caddy/stable/gpg.key && \
    gpg --dearmor --batch --yes -o /etc/apt/keyrings/caddy.gpg /etc/apt/keyrings/caddy.gpg.key && \
    echo "deb [signed-by=/etc/apt/keyrings/caddy.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main" > /etc/apt/sources.list.d/caddy.list && \
    apt-get update && apt-get install -y --no-install-recommends \
        nodejs caddy chromium tini \
    && rm -rf /var/lib/apt/lists/*

# Bake the openclaw runtime. Pinned version matches install-claw.sh.
RUN useradd -r -m -d /home/openclaw -s /bin/bash openclaw && \
    mkdir -p /opt/openclaw && \
    chown -R openclaw:openclaw /opt/openclaw && \
    sudo -u openclaw -H npm config set prefix /opt/openclaw 2>/dev/null || \
    su - openclaw -c "npm config set prefix /opt/openclaw" && \
    su - openclaw -c "npm install -g --prefer-offline --no-audit --no-fund openclaw@2026.4.11"

ENV PATH=/opt/openclaw/bin:$PATH

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# OpenClaw gateway (18789), wizard (18790), Caddy (80/443).
EXPOSE 80 443

# tini reaps zombies cleanly when the gateway forks workers; without
# it the container leaks defunct processes after an internal restart.
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
