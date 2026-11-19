#!/bin/bash
# Turns a fresh ubuntu:24.04 (image A) or Cloudflare's debian-trixie (image B, before prefill.sh)
# container into a one-job GitHub Actions runner (HAL-13578).
# Runs as root, once, before the runner starts. Holds no secret: the runner's one-time
# registration (JIT config) reaches it later, as an environment variable of the runner process.
set -euo pipefail

RUNNER_VERSION=2.338.2
RUNNER_SHA256=baebf204307bac6193480852732f0aba2ae97b6c5597c244f4d5558390147c40
# A bare `node` on the hosted image is Node 22; pnpm brings the repo's own Node 26.
NODE_VERSION=22.23.5
NODE_SHA256=cdeb8670a0c81f51b4dc4ac61919f9b1ad917b304bf8221eb939570663d240f8

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
# What the jobs that run here call outside of pnpm: git, curl, jq, sudo, zstd for actions/cache.
apt-get install -y -qq --no-install-recommends \
  ca-certificates curl git jq sudo xz-utils zstd unzip tar gzip build-essential python3 \
  "$(apt-cache search --names-only '^libicu[0-9]+$' | cut -d' ' -f1 | sort -V | tail -1)" >/dev/null

# Downloads go to a scratch folder; the hooks' state goes to $state, which the runner user owns.
scratch=$(mktemp -d)
state=/opt/cf-runner
mkdir -p "$state"

curl -fsSL -o "$scratch/node.tar.xz" "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz"
echo "${NODE_SHA256}  $scratch/node.tar.xz" | sha256sum -c --quiet
tar -xJf "$scratch/node.tar.xz" -C /usr/local --strip-components=1 --exclude='*/CHANGELOG.md' --exclude='*/README.md'
rm "$scratch/node.tar.xz"

# Like the hosted image: user `runner`, passwordless sudo.
useradd -m -u 1001 -s /bin/bash runner
echo 'runner ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/runner
chmod 0440 /etc/sudoers.d/runner

# worker.mjs's RUN, which runs in this same shell, uses $home and $dir too.
home=$(getent passwd runner | cut -d: -f6)
dir=$home/actions-runner
mkdir -p "$dir"
curl -fsSL -o "$scratch/runner.tar.gz" \
  "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
echo "${RUNNER_SHA256}  $scratch/runner.tar.gz" | sha256sum -c --quiet
tar -xzf "$scratch/runner.tar.gz" -C "$dir"
rm -r "$scratch"

# The runner runs this before the job's first step. A job that isn't the merge queue or a push
# to main of halonic-com/halonic fails here, before any of its code runs: the Worker only
# registers runners for those, but a pull request from a fork could still ask for the label.
cat > "$home/job-started.sh" <<'EOF'
#!/bin/bash
ok=no
if [ "${GITHUB_REPOSITORY:-}" = "halonic-com/halonic" ]; then
  case "${GITHUB_EVENT_NAME:-}" in
    merge_group) case "${GITHUB_REF:-}" in refs/heads/gh-readonly-queue/main/*) ok=yes ;; esac ;;
    push) [ "${GITHUB_REF:-}" = "refs/heads/main" ] && ok=yes ;;
  esac
fi
if [ "$ok" != yes ]; then
  echo "::error::This runner only takes merge-queue and main jobs of halonic-com/halonic, not ${GITHUB_EVENT_NAME:-?} on ${GITHUB_REF:-?} of ${GITHUB_REPOSITORY:-?}."
  exit 1
fi
date +%s > /opt/cf-runner/job-started
# Seconds from the Worker's start() (CF_STARTED_AT) to the job's first step: container start,
# setup and runner together.
echo $(( $(date +%s) - ${CF_STARTED_AT:-$(date +%s)} )) > /opt/cf-runner/boot-to-job
echo "Cloudflare container runner (HAL-13578): $(nproc) vCPU, $(free -g | awk '/^Mem:/{print $2}') GiB memory, $(df -h / | awk 'NR==2{print $4}') disk free."
EOF

# The runner runs this after the job's last step; it prints the measurements into the job's log.
cat > "$home/job-completed.sh" <<'EOF'
#!/bin/bash
started=$(cat /opt/cf-runner/job-started 2>/dev/null || date +%s)
read -r mem disk < /opt/cf-runner/peak 2>/dev/null || { mem=0; disk=0; }
boot=$(cat /opt/cf-runner/boot-to-job 2>/dev/null || echo 0)
line="cf-runner image=${CF_RUNNER_IMAGE:-a} job=${GITHUB_JOB:-?} run=${GITHUB_RUN_ID:-?} boot_to_job=${boot} seconds=$(( $(date +%s) - started )) peak_mem_mib=${mem} peak_disk_mib=${disk}"
echo "$line"
echo "$line" > /opt/cf-runner/job-metrics
EOF
chmod 0755 "$home/job-started.sh" "$home/job-completed.sh"

# Peak memory in use and peak disk used, every 5 seconds, for the measurements above.
cat > /usr/local/bin/cf-sample <<'EOF'
#!/bin/bash
mem_peak=0; disk_peak=0
while sleep 5; do
  mem=$(awk '/^MemTotal:/{t=$2} /^MemAvailable:/{a=$2} END{print int((t-a)/1024)}' /proc/meminfo)
  disk=$(df -m --output=used / | tail -1 | tr -d ' ')
  [ "$mem" -gt "$mem_peak" ] && mem_peak=$mem
  [ "$disk" -gt "$disk_peak" ] && disk_peak=$disk
  echo "$mem_peak $disk_peak" > /opt/cf-runner/peak.new && mv /opt/cf-runner/peak.new /opt/cf-runner/peak
done
EOF
chmod 0755 /usr/local/bin/cf-sample

chown -R runner:runner "$home" "$state"
"$dir/bin/installdependencies.sh" >/dev/null
echo "bootstrap done: runner ${RUNNER_VERSION}, node $(node --version), $(df -m --output=used / | tail -1 | tr -d ' ') MiB used"
