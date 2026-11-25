# syntax=docker/dockerfile:1.7
# The run container: one per run, started by the Worker's container class. Harness steps run here
# through `exec`; the container itself has no internet, and the Worker intercepts the bridge's name
# and the profile's allowed sites (see adapters/sandbox-cloudflare-container).
#
# Build context: the repo root, so the srt patch comes from `patches/`. Dockerfile.dockerignore
# keeps everything else out of the context.
#
# Supply chain: the base image is pinned by digest, and every download is checked against a sha256
# before it is used (`ADD --checksum` fails the build on a mismatch). Each one is listed in
# tooling/check/dependencies.json. To update a version, change it here and its checksum together.

FROM node:22.21.1-bookworm-slim@sha256:25b3eb23a00590b7499f2a2ce939322727fcce1b15fdd69754fcd09536a3ae2c

# ca-certificates: the Containers CA is trusted below. bubblewrap, socat and ripgrep: what srt
# needs on Linux. patch: applies Halonic's srt patch, then is removed.
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates bubblewrap socat ripgrep patch \
  && rm -rf /var/lib/apt/lists/*

# Claude Code: the native Linux binary only, not the npm wrapper (whose install script picks it).
ADD --checksum=sha256:1c89f2f1e0bee93742cff8de9181fc07c702ce0651f1492bb3b97487d3a84af1 \
  https://registry.npmjs.org/@anthropic-ai/claude-code-linux-x64/-/claude-code-linux-x64-2.1.332.tgz \
  /build/claude-code.tgz

# Codex: the native Linux binary only, not the npm wrapper.
ADD --checksum=sha256:48a5ee5dba98c7745a48b8d72af84f91880fec5856269627328fd564f60d41a7 \
  https://registry.npmjs.org/@openai/codex/-/codex-0.172.0-linux-x64.tgz \
  /build/codex.tgz

# srt and the exact versions of its four dependencies that pnpm-lock.yaml resolves.
ADD --checksum=sha256:fb9bf9502715525e5bf366cc8454c8e6c43c2506b544beb8079a1a508c398f89 \
  https://registry.npmjs.org/@anthropic-ai/sandbox-runtime/-/sandbox-runtime-0.0.82.tgz /build/srt/
ADD --checksum=sha256:84efd155bed93270286e793fc951be270b536cbd5b0eeb111f0fa3967201d698 \
  https://registry.npmjs.org/zod/-/zod-4.6.7.tgz /build/srt/
ADD --checksum=sha256:56affc6ddafe486f94b428ae2823d059cf60d4dae2f33eaaf1b1ec4306f73173 \
  https://registry.npmjs.org/commander/-/commander-12.1.0.tgz /build/srt/
ADD --checksum=sha256:0a872d932911012524495ab07dbf49351bd8ac23f12ea4766dc400f29ffc3356 \
  https://registry.npmjs.org/node-forge/-/node-forge-1.4.3.tgz /build/srt/
ADD --checksum=sha256:313f926920874118c5bb7263604dd58790fdd3fe321d397f94014ffc557348f1 \
  https://registry.npmjs.org/@pondwader/socks5-server/-/socks5-server-1.0.10.tgz /build/srt/
COPY patches/@anthropic-ai__sandbox-runtime@0.0.82.patch /build/srt/srt.patch

# --ignore-scripts and --offline: npm only unpacks the checked tarballs, runs nothing from them and
# fetches nothing else.
RUN tar -xzf /build/claude-code.tgz -C /build package/claude \
  && install -m 0755 /build/package/claude /usr/local/bin/claude \
  && rm -rf /build/package \
  && tar -xzf /build/codex.tgz -C /build package/vendor/x86_64-unknown-linux-musl/bin/codex \
  && install -m 0755 /build/package/vendor/x86_64-unknown-linux-musl/bin/codex /usr/local/bin/codex \
  && mkdir -p /opt/srt \
  && cd /opt/srt \
  && npm install --offline --ignore-scripts --no-audit --no-fund --omit=optional --cache /build/npm-cache /build/srt/*.tgz \
  && patch --directory=node_modules/@anthropic-ai/sandbox-runtime --strip=1 < /build/srt/srt.patch \
  && ln -s /opt/srt/node_modules/@anthropic-ai/sandbox-runtime/dist/cli.js /usr/local/bin/srt \
  && rm -rf /build \
  && apt-get purge --yes patch

# The Containers CA: Cloudflare puts it here at start, for the TLS of the intercepted sites.
# Trusting it at start, not at build, because the platform supplies the file only then.
COPY --chmod=0755 packages/targets/cloudflare/runtime/container/trust-containers-ca.sh /usr/local/bin/

# Never root: harness steps run as this user, with only their workspace writable.
RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin halonic \
  && mkdir -p /workspace \
  && chown halonic:halonic /workspace
WORKDIR /workspace

ENTRYPOINT ["/usr/local/bin/trust-containers-ca.sh"]
CMD ["sleep", "infinity"]
