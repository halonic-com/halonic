# halonic-ci runner image: one container = one job (JIT runner), then deleted.
# Built inside the CI VM: docker build -t halonic-ci-runner:<runner-version> .
FROM ubuntu:24.04
ARG RUNNER_VERSION=2.338.2
ARG RUNNER_SHA256=baebf204307bac6193480852732f0aba2ae97b6c5597c244f4d5558390147c40
ARG PLAYWRIGHT_VERSION=1.65.0
ARG NODE_VERSION=22.22.0
ENV DEBIAN_FRONTEND=noninteractive LANG=C.UTF-8
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl git git-lfs jq unzip zip xz-utils tar gzip zstd build-essential \
      python3 openssh-client gnupg lsb-release locales tzdata rsync file \
 && install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli.gpg \
 && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/githubcli.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*
# Playwright's system libraries for chromium + webkit, so CI's apt step finds nothing missing
# (no sudo in the container). Node is only used for this step, then removed.
RUN mkdir /opt/node-build && cd /opt/node-build \
 && curl -fsSLO https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz \
 && curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt | grep " node-v${NODE_VERSION}-linux-x64.tar.xz$" | sha256sum -c - \
 && tar -xJf node-v${NODE_VERSION}-linux-x64.tar.xz \
 && apt-get update \
 && PATH=$PWD/node-v${NODE_VERSION}-linux-x64/bin:$PATH npx -y playwright@${PLAYWRIGHT_VERSION} install-deps chromium webkit \
 && cd / && rm -rf /opt/node-build "$HOME/.npm" /var/lib/apt/lists/*
# Node on PATH, as on GitHub's ubuntu image: steps and tests run `node` directly. The version the
# repo's devEngines asks for.
ARG CI_NODE_VERSION=26.12.0
RUN mkdir /opt/node-ci && cd /opt/node-ci \
 && curl -fsSLO https://nodejs.org/dist/v${CI_NODE_VERSION}/node-v${CI_NODE_VERSION}-linux-x64.tar.xz \
 && curl -fsSL https://nodejs.org/dist/v${CI_NODE_VERSION}/SHASUMS256.txt | grep " node-v${CI_NODE_VERSION}-linux-x64.tar.xz$" | sha256sum -c - \
 && tar -xJf node-v${CI_NODE_VERSION}-linux-x64.tar.xz -C /usr/local --strip-components=1 \
      --exclude='*/CHANGELOG.md' --exclude='*/README.md' --exclude='*/LICENSE' \
 && cd / && rm -rf /opt/node-ci && node --version
# The runner lives in the runner user's home, actions-runner/ (entry.sh, the hook's event path and
# the slot script's JOB_WORK name it).
RUN useradd -m -u 1001 -s /bin/bash runner \
 && mkdir ~runner/actions-runner && cd ~runner/actions-runner \
 && curl -fsSL -o runner.tgz https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz \
 && echo "${RUNNER_SHA256}  runner.tgz" | sha256sum -c - \
 && tar -xzf runner.tgz && rm runner.tgz \
 && ./bin/installdependencies.sh && rm -rf /var/lib/apt/lists/* \
 && mkdir -p _work && chown -R runner:runner ~runner
COPY --chown=root:root --chmod=0555 job-started.sh /opt/halonic-ci/job-started.sh
COPY --chown=root:root --chmod=0555 entry.sh /opt/halonic-ci/entry.sh
ENV ACTIONS_RUNNER_HOOK_JOB_STARTED=/opt/halonic-ci/job-started.sh \
    pnpm_config_store_dir=/cache/pnpm-store \
    PLAYWRIGHT_BROWSERS_PATH=/cache/ms-playwright
USER runner
ENTRYPOINT ["/opt/halonic-ci/entry.sh"]
