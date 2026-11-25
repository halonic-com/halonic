#!/usr/bin/env bash
# One cycle of the Windows runner, as root (halonic-win-runner.service restarts it): a clean VM
# (restore-vm.sh), a just-in-time runner for one job, then the VM destroyed, its overlay deleted
# and the runner removed. The App key stays on the host (/etc/halonic-win/app.pem); the VM gets
# only the one job's runner config, on SSH stdin. A job gets 6 hours from the moment GitHub shows
# the runner busy. Usage: win-runner-cycle.sh [--cleanup]
set -euo pipefail

HERE=$(cd "$(dirname "$(readlink -f "$0")")" && pwd)
ETC=/etc/halonic-win
LIB=/var/lib/halonic-win
VM=halonic-win
ORG=halonic-com
REPO=halonic-com/halonic
GROUP=halonic-win
PREFIX=hwin-
KEY=$ETC/app.pem
JOB_LIMIT_S=$((6 * 3600))
SSH=(ssh -i "$ETC/ssh/id_ed25519" -o UserKnownHostsFile="$ETC/ssh/known_hosts"
  -o StrictHostKeyChecking=yes -o BatchMode=yes -o ConnectTimeout=5 -o ServerAliveInterval=60 halonic@10.79.0.10)
CLEANUP=""

fail() { echo "win-runner: $*" >&2; exit 1; }
log() { echo "win-runner: $*"; }

[[ $# == 0 || ($# == 1 && $1 == --cleanup) ]] || fail "usage: win-runner-cycle.sh [--cleanup]"
if [[ ${1:-} == --cleanup ]]; then CLEANUP=1; fi
[[ $(id -u) == 0 ]] || fail "run as root"
# systemd stops the unit with SIGTERM; exit through the EXIT trap, so the VM goes down with it.
trap 'exit 143' TERM INT

# No VM and no overlay left behind: what every cycle ends with, and the first thing --cleanup
# (ExecStopPost) does, before anything that can fail.
vm_down() {
  local state
  state=$(virsh domstate "$VM" 2>/dev/null) || state=""
  if [[ -n $state && $state != "shut off" ]]; then virsh destroy "$VM" >/dev/null; fi
  rm -f "$LIB/run.qcow2"
}
if [[ -n $CLEANUP ]]; then vm_down; fi
# Paused: take no new job. The sleep keeps a paused unit from restarting every few seconds.
if [[ -z $CLEANUP && -e $ETC/paused ]]; then
  log "paused ($ETC/paused exists), not taking a job"
  sleep 60
  exit 0
fi

# --- GitHub: an installation token for the App halonic-win-runners (self-hosted runners only).
# shellcheck source=/dev/null
. "$ETC/runner.env" # APP_ID INSTALLATION_ID
[[ ${APP_ID:-} =~ ^[0-9]+$ && ${INSTALLATION_ID:-} =~ ^[0-9]+$ ]] || fail "$ETC/runner.env must set APP_ID and INSTALLATION_ID"
[[ -f $KEY && ! -L $KEY && $(stat -c '%u %a' "$KEY") == "0 400" ]] || fail "$KEY must be a root-owned 0400 file"
b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
api() { curl -fsS --max-time 30 -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" "$@"; }
TOKEN=""; TOKEN_AT=-3600
# token: mints a new installation token when the last one is older than 50 minutes (they last 60).
token() {
  ((SECONDS - TOKEN_AT < 3000)) && return 0
  local now hdr pl sig
  now=$(date +%s)
  hdr=$(printf '{"alg":"RS256","typ":"JWT"}' | b64url)
  pl=$(printf '{"iat":%d,"exp":%d,"iss":"%s"}' $((now - 60)) $((now + 540)) "$APP_ID" | b64url)
  sig=$(printf '%s.%s' "$hdr" "$pl" | openssl dgst -sha256 -sign "$KEY" -binary | b64url)
  TOKEN=$(api -X POST -H "Authorization: Bearer $hdr.$pl.$sig" \
    "https://api.github.com/app/installations/$INSTALLATION_ID/access_tokens" | jq -r .token) || TOKEN=""
  [[ -n $TOKEN && $TOKEN != null ]] || { echo "win-runner: no installation token" >&2; return 1; }
  TOKEN_AT=$SECONDS
}
gh_api() { token && api -H "Authorization: Bearer $TOKEN" "$@"; }

# --- Runners: none of ours left registered once its VM is gone.
remove_runner() {
  gh_api -X DELETE "https://api.github.com/orgs/$ORG/actions/runners/$1" -o /dev/null &&
    log "removed runner $1" || echo "win-runner: could not remove runner $1 (gone already?)" >&2
}
# A cycle runs one runner at a time, so an idle one with our prefix belongs to a cycle that's gone.
remove_stale() {
  gh_api "https://api.github.com/orgs/$ORG/actions/runner-groups/$GROUP_ID/runners?per_page=100" |
    jq -r --arg p "$PREFIX" '.runners[] | select((.name | startswith($p)) and (.busy | not)) | .id' |
    while read -r id; do remove_runner "$id"; done
}

# The runner group must exist and admit only halonic-com/halonic. Selected workflows: README.
GROUP_ID=$(gh_api "https://api.github.com/orgs/$ORG/actions/runner-groups?per_page=100" |
  jq -r --arg g "$GROUP" '.runner_groups[] | select(.name == $g) | .id') || fail "can't list runner groups"
[[ $GROUP_ID =~ ^[0-9]+$ ]] || fail "no runner group $GROUP in $ORG"
repos=$(gh_api "https://api.github.com/orgs/$ORG/actions/runner-groups/$GROUP_ID/repositories" |
  jq -r '[.repositories[].full_name] | join(" ")') || fail "can't read runner group $GROUP's repositories"
[[ $repos == "$REPO" ]] || fail "runner group $GROUP must admit only $REPO (it admits: ${repos:-none})"

if [[ -n $CLEANUP ]]; then
  remove_stale
  exit 0
fi
remove_stale

# --- A clean VM. The runner is created only once SSH answers, so a VM that doesn't boot leaves none.
RUNNER_ID=""
finish() {
  vm_down
  if [[ -n $RUNNER_ID ]]; then remove_runner "$RUNNER_ID"; fi
}
trap finish EXIT
"$HERE/restore-vm.sh" --start
deadline=$((SECONDS + 600))
until "${SSH[@]}" 'exit 0' >/dev/null 2>&1; do
  ((SECONDS < deadline)) || fail "no SSH to $VM 10 minutes after its start"
  sleep 10
done

# GitHub adds the labels self-hosted, Windows and X64 itself; halonic-win picks this runner.
NAME="$PREFIX$(date -u +%Y%m%d%H%M%S)"
RESP=$(gh_api -X POST "https://api.github.com/orgs/$ORG/actions/runners/generate-jitconfig" \
  -d "$(jq -nc --arg n "$NAME" --argjson g "$GROUP_ID" '{name: $n, runner_group_id: $g, labels: ["halonic-win"], work_folder: "_work"}')") ||
  fail "no just-in-time runner config"
RUNNER_ID=$(jq -r .runner.id <<<"$RESP")
[[ $RUNNER_ID =~ ^[0-9]+$ ]] || fail "the just-in-time config names no runner"
CONFIG=$(jq -r .encoded_jit_config <<<"$RESP")
unset RESP
log "runner $NAME (id $RUNNER_ID) waiting for a job"
printf '%s' "$CONFIG" | "${SSH[@]}" 'powershell -NoProfile -ExecutionPolicy Bypass -File "$env:SystemDrive\halonic-win\run-job.ps1"' &
JOB_PID=$!
unset CONFIG

# Every minute: has the job started (GitHub shows the runner busy), and has it run 6 hours?
JOB_START=0; ticks=0
while kill -0 "$JOB_PID" 2>/dev/null; do
  sleep 5
  ((++ticks % 12 == 0)) || continue
  if ((JOB_START == 0)); then
    busy=$(gh_api "https://api.github.com/orgs/$ORG/actions/runners/$RUNNER_ID" | jq -r .busy) || busy=unknown
    if [[ $busy == true ]]; then JOB_START=$SECONDS; log "runner $NAME took a job"; fi
  elif ((SECONDS - JOB_START >= JOB_LIMIT_S)); then
    log "runner $NAME: the job ran 6 hours; stopping it"
    kill "$JOB_PID"
    break
  fi
done
rc=0; wait "$JOB_PID" || rc=$?
if ((JOB_START > 0)); then log "runner $NAME: job ended after $((SECONDS - JOB_START)) s, exit $rc"; else log "runner $NAME: ended with no job seen, exit $rc"; fi
