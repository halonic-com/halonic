#!/bin/bash
# Image B (HAL-13578): runs after bootstrap.sh, in the same shell, in a builder container that
# never takes a job. Fills the pnpm store from main's lockfile, then waits; the Worker saves the
# container's filesystem as a snapshot and starts each image-B job from that snapshot.
# Holds no secret: the builder gets no runner registration and clones the public repository.
set -euo pipefail

store=/opt/pnpm-store
mkdir -p "$store"
chown runner:runner "$store"

# Every job on this runner uses that store: the runner passes its .env to each job. Both names,
# so the pnpm that pnpm/action-setup installs reads it whatever its version.
printf 'npm_config_store_dir=%s\npnpm_config_store_dir=%s\nCF_RUNNER_IMAGE=b\n' "$store" "$store" \
  > "$dir/.env"
chown runner:runner "$dir/.env"

src=$(mktemp -d)
chown runner:runner "$src"
runuser -u runner -- git clone --quiet --depth 1 https://github.com/halonic-com/halonic.git "$src/halonic"
version=$(jq -r '.packageManager' "$src/halonic/package.json" | sed 's/^pnpm@//; s/+.*//')
npm install --global --silent "pnpm@${version}"

# The install downloads every package and the Node that devEngines pins into the store. Scripts
# don't run: the job runs them itself, from its own checkout.
runuser -u runner -- env HOME="$home" npm_config_store_dir="$store" pnpm_config_store_dir="$store" \
  bash -c "cd '$src/halonic' && pnpm install --frozen-lockfile --ignore-scripts --reporter=append-only >/dev/null && pnpm store path"
lock=$(sha256sum "$src/halonic/pnpm-lock.yaml" | cut -d' ' -f1)
commit=$(runuser -u runner -- git -C "$src/halonic" rev-parse HEAD)
rm -rf "$src" /tmp/* "$home/.cache"
npm cache clean --force --silent
apt-get clean
rm -rf /var/lib/apt/lists/*

echo "lockfile=${lock} commit=${commit}" > /opt/cf-runner/prefilled
echo "prefill done: pnpm ${version}, store $(du -sm "$store" | cut -f1) MiB, $(df -m --output=used / | tail -1 | tr -d ' ') MiB used"
