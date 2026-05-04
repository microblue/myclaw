#!/bin/bash
# Installs a systemd path unit that restarts openclaw-gateway whenever
# /opt/openclaw/lib/node_modules/openclaw/package.json changes — i.e.
# whenever the WebUI Update button (or any other npm install -g openclaw
# invocation) writes a new version on disk.
#
# Background: cloud-init pre-seeds gateway.reload.mode=off to break the
# 12-minute self-restart loop, but that also kills openclaw's own
# update.run -> restartGateway path. Without this watcher, the WebUI
# Update flow rewrites package.json on disk but the running process
# keeps serving the old code in memory.
#
# Hosted as a separate file (rather than inlined into cloud-init.ts)
# because Lightsail's userData has a hard 16KB cap after base64 encoding
# and we are within ~40 bytes of it. Iterating on the watcher logic only
# requires a web deploy.

set -eu

cat > /etc/systemd/system/openclaw-version-watch.path << 'PWATCH'
[Unit]
Description=Watch openclaw package.json for self-upgrade
After=openclaw-gateway.service

[Path]
PathChanged=/opt/openclaw/lib/node_modules/openclaw/package.json

[Install]
WantedBy=multi-user.target
PWATCH

# 10s settling delay before restart. npm install -g rewrites multiple
# files in the package dir and the path unit fires once per close-write.
# While the service is running, additional triggers are dropped — so as
# long as the sleep covers the typical install duration (~3-6s observed
# for a fully-cached upgrade), we get exactly one restart per upgrade.
cat > /etc/systemd/system/openclaw-version-watch.service << 'VSVC'
[Unit]
Description=Restart openclaw-gateway after self-upgrade
After=openclaw-gateway.service

[Service]
Type=oneshot
ExecStartPre=/bin/sleep 10
ExecStart=/bin/systemctl restart openclaw-gateway.service
VSVC

systemctl daemon-reload
systemctl enable --now openclaw-version-watch.path

echo "[oc] version-watcher installed and armed"
