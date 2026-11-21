#!/bin/bash
# One cycle of one runner slot (systemd halonic-runner@<slot>.service restarts it):
# mint a GitHub App token -> JIT config (one runner, one job) -> run a fresh container ->
# clean up. The App key never leaves this VM's root-only /etc/halonic-ci/app.pem.
set -euo pipefail
SLOT=${1:?slot, e.g. large-1}
. /etc/halonic-ci/pool.env   # APP_ID INSTALLATION_ID ORG RUNNER_GROUP_ID IMAGE
KEY=/etc/halonic-ci/app.pem
TRUSTED=/cache/trusted; TRUSTED_PROJ=300; TRUSTED_QUOTA=20g
fail() { echo "slot ${SLOT}: $1" >&2; exit 1; }
# Fail closed: the App key must be a root-only 0400 file, not a link.
[ -f "$KEY" ] && [ ! -L "$KEY" ] || fail "$KEY missing or not a file"
[ "$(stat -c '%u %a' "$KEY")" = "0 400" ] || fail "$KEY must be owned by root with mode 0400"
case "$SLOT" in
  large-*) LABEL=halonic-ci-large; CPUS=12; MEM=9g;  QUOTA=20g; TMPFS=1g ;;
  small-*) LABEL=halonic-ci-small; CPUS=2;  MEM=2g;  QUOTA=6g;  TMPFS=512m ;;
  *) echo "unknown slot $SLOT" >&2; exit 2 ;;
esac
N=${SLOT##*-}
case "$SLOT" in large-*) PROJ=$((100+N));; small-*) PROJ=$((200+N));; esac

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
now=$(date +%s)
hdr=$(printf '{"alg":"RS256","typ":"JWT"}' | b64url)
pl=$(printf '{"iat":%d,"exp":%d,"iss":"%s"}' $((now-60)) $((now+540)) "$APP_ID" | b64url)
sig=$(printf '%s.%s' "$hdr" "$pl" | openssl dgst -sha256 -sign "$KEY" -binary | b64url)
JWT="$hdr.$pl.$sig"
api() { curl -fsS -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" "$@"; }
TOKEN=$(api -X POST -H "Authorization: Bearer $JWT" \
  "https://api.github.com/app/installations/$INSTALLATION_ID/access_tokens" | jq -r .token)
[ -n "$TOKEN" ] && [ "$TOKEN" != null ] || fail "no installation token"

# Remove this slot's leftover idle registrations (a slot runs one runner at a time, so any
# that exist now belong to a container that is gone: VM reboot, slot restart).
api -H "Authorization: Bearer $TOKEN" \
  "https://api.github.com/orgs/$ORG/actions/runner-groups/$RUNNER_GROUP_ID/runners?per_page=100" \
  | jq -r --arg p "hci-$SLOT-" '.runners[] | select((.name|startswith($p)) and (.busy|not)) | .id' \
  | while read -r id; do
      curl -sS -o /dev/null -X DELETE -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
        "https://api.github.com/orgs/$ORG/actions/runners/$id" && echo "slot $SLOT: removed stale runner $id"
    done || true
[ "${2:-}" = "--cleanup" ] && exit 0

NAME="hci-$SLOT-$(date +%Y%m%d%H%M%S)"
RESP=$(api -X POST -H "Authorization: Bearer $TOKEN" \
  "https://api.github.com/orgs/$ORG/actions/runners/generate-jitconfig" \
  -d "$(jq -nc --arg n "$NAME" --arg l "$LABEL" --argjson g "$RUNNER_GROUP_ID" \
        '{name:$n, runner_group_id:$g, labels:[$l], work_folder:"_work"}')")
RUNNER_ID=$(jq -r .runner.id <<<"$RESP")

# userns-remap: container uid 1001 (runner) = host uid SUBUID_BASE+1001
BASE=$(awk -F: '$1=="dockremap"{print $2; exit}' /etc/subuid)
[[ "$BASE" =~ ^[1-9][0-9]*$ ]] || fail "no dockremap range in /etc/subuid (userns-remap off?)"
RUID=$((BASE+1001))
RUN=/run/halonic-ci/$SLOT; WORK=/cache/work/$SLOT
JOB_WORK=/home/runner/actions-runner/_work  # leak-guard: allow absolute-path the runner's work dir inside the image
rm -rf "$RUN" "$WORK"; install -d -m 0700 -o "$RUID" -g "$RUID" "$RUN" "$WORK"
umask 077; jq -r .encoded_jit_config <<<"$RESP" > "$RUN/jitconfig"; chown "$RUID:$RUID" "$RUN/jitconfig"; chmod 0400 "$RUN/jitconfig"
unset RESP TOKEN JWT
xfs_quota -x -c "project -s -p $WORK $PROJ" -c "limit -p bhard=$QUOTA $PROJ" /cache >/dev/null
# The shared caches get one project quota too (set once: new files inherit the project).
(
  flock 9
  if ! xfs_io -c lsproj "$TRUSTED" 2>/dev/null | grep -qx "projid = $TRUSTED_PROJ"; then
    xfs_quota -x -c "project -s -p $TRUSTED $TRUSTED_PROJ" /cache >/dev/null
  fi
  xfs_quota -x -c "limit -p bhard=$TRUSTED_QUOTA $TRUSTED_PROJ" /cache >/dev/null
) 9>/run/halonic-ci/trusted-quota.lock

STATE=/run/halonic-ci/$SLOT.state; JOBLOG=/var/log/halonic-ci/jobs.jsonl
install -d -m 0755 /var/log/halonic-ci
cleanup() {
  docker rm -f "hci-$SLOT" >/dev/null 2>&1 || true
  rm -rf "$RUN" "$WORK" "$STATE"
}
trap cleanup EXIT
echo "slot $SLOT: runner $NAME (id $RUNNER_ID) waiting for a job"
STARTED=$(date +%s)
docker run --rm --name "hci-$SLOT" --hostname "$NAME" --init \
  --cpus "$CPUS" --memory "$MEM" --memory-swap "$MEM" --pids-limit 8192 \
  --cap-drop ALL --security-opt no-new-privileges \
  --tmpfs "/tmp:rw,nosuid,nodev,size=$TMPFS" \
  -v "$RUN:/run/halonic-ci:ro" \
  -v /etc/halonic-ci/pool:/etc/halonic-ci:ro \
  -v "$WORK:$JOB_WORK" \
  -v "$TRUSTED/pnpm-store:/cache/pnpm-store" \
  -v "$TRUSTED/ms-playwright:/cache/ms-playwright" \
  "$IMAGE" &
DPID=$!

# Sample the container every 5 s for the status feed: busy (a job's Runner.Worker is running),
# peak memory and CPU time from its cgroup. Read-only; nothing here touches the job.
JOB_START=0; PEAK=0; CPU_US=0; EV=""; REF=""; SHA=""
write_state() {
  local now; now=$(date +%s)
  jq -nc --arg slot "$SLOT" --arg runner "$NAME" --arg label "$LABEL" --argjson up "$STARTED" \
    --argjson js "$JOB_START" --argjson peak "$PEAK" --argjson cpu "$CPU_US" --argjson now "$now" \
    --arg ev "$EV" --arg ref "$REF" --arg sha "$SHA" --argjson memlimit "$(numfmt --from=iec "${MEM^^}")" \
    '{slot:$slot, runner:$runner, label:$label, registered_at:$up, busy:($js>0),
      job_started_at:(if $js>0 then $js else null end), job_seconds:(if $js>0 then $now-$js else null end),
      event:(if $ev=="" then null else $ev end), ref:(if $ref=="" then null else $ref end), sha:(if $sha=="" then null else $sha end),
      mem_peak:$peak, mem_limit:$memlimit, cpu_seconds:($cpu/1000000|floor), updated_at:$now}' > "$STATE.tmp" \
    && mv -f "$STATE.tmp" "$STATE"
}
while kill -0 "$DPID" 2>/dev/null; do
  cid=$(docker inspect -f '{{.Id}}' "hci-$SLOT" 2>/dev/null || true)
  cg=/sys/fs/cgroup/system.slice/docker-$cid.scope
  if [ -n "$cid" ] && [ -d "$cg" ]; then
    PEAK=$(cat "$cg/memory.peak" 2>/dev/null || echo "$PEAK")
    CPU_US=$(awk '$1=="usage_usec"{print $2}' "$cg/cpu.stat" 2>/dev/null || echo "$CPU_US")
    procs=$(for p in $(cat "$cg/cgroup.procs" 2>/dev/null); do cat "/proc/$p/comm" 2>/dev/null; done || true)
    if [ "$JOB_START" = 0 ] && [[ "$procs" == *Runner.Worker* ]]; then
      JOB_START=$(date +%s)
    fi
    # The event file is the job's to change (it could be a link to any VM file), so read it
    # inside the container as the runner user, never as root here. Both timeouts: a FIFO there
    # mustn't stall the status feed or leave a stuck reader in the container.
    if [ "$JOB_START" != 0 ] && [ -z "$EV" ]; then
      evj=$(timeout 10 docker exec "hci-$SLOT" timeout 5 head -c 1048576 "$JOB_WORK/_temp/_github_workflow/event.json" 2>/dev/null || true)
      if [ -n "$evj" ]; then
        if   jq -e 'has("merge_group")'  >/dev/null 2>&1 <<<"$evj"; then EV=merge_group; REF=$(jq -r '.merge_group.head_ref // ""' <<<"$evj"); SHA=$(jq -r '.merge_group.head_sha // ""' <<<"$evj")
        elif jq -e 'has("pull_request")' >/dev/null 2>&1 <<<"$evj"; then EV=pull_request; REF=$(jq -r '.pull_request.head.ref // ""' <<<"$evj"); SHA=$(jq -r '.pull_request.head.sha // ""' <<<"$evj")
        elif jq -e . >/dev/null 2>&1 <<<"$evj"; then EV=push; REF=$(jq -r '.ref // ""' <<<"$evj"); SHA=$(jq -r '.after // ""' <<<"$evj"); fi
        REF=${REF:0:255}; SHA=${SHA:0:64}
      fi
    fi
  fi
  write_state
  sleep 5
done
RC=0; wait "$DPID" || RC=$?
echo "slot $SLOT: container exited with $RC"
if [ "$JOB_START" != 0 ]; then
  END=$(date +%s)
  jq -nc --arg slot "$SLOT" --arg runner "$NAME" --arg label "$LABEL" --argjson s "$JOB_START" --argjson e "$END" \
    --argjson peak "$PEAK" --argjson cpu "$CPU_US" --argjson rc "$RC" --arg ev "$EV" --arg ref "$REF" --arg sha "$SHA" \
    --argjson memlimit "$(numfmt --from=iec "${MEM^^}")" --argjson cpus "$CPUS" \
    '{slot:$slot, runner:$runner, label:$label, event:$ev, ref:$ref, sha:$sha, started_at:$s, ended_at:$e,
      seconds:($e-$s), mem_peak:$peak, mem_limit:$memlimit, cpu_seconds:($cpu/1000000|floor), cpus:$cpus, exit:$rc}' >> "$JOBLOG"
  # keep the last 5000 jobs
  if [ "$(wc -l < "$JOBLOG")" -gt 6000 ]; then tail -n 5000 "$JOBLOG" > "$JOBLOG.tmp" && mv -f "$JOBLOG.tmp" "$JOBLOG"; fi
fi
# A JIT runner removes itself after its job; if the container died early, remove it here.
if [ -n "${RUNNER_ID:-}" ] && [ "$RUNNER_ID" != null ]; then
  now=$(date +%s)
  pl=$(printf '{"iat":%d,"exp":%d,"iss":"%s"}' $((now-60)) $((now+540)) "$APP_ID" | b64url)
  sig=$(printf '%s.%s' "$hdr" "$pl" | openssl dgst -sha256 -sign "$KEY" -binary | b64url)
  T=$(api -X POST -H "Authorization: Bearer $hdr.$pl.$sig" "https://api.github.com/app/installations/$INSTALLATION_ID/access_tokens" | jq -r .token) || T=
  [ -n "$T" ] && curl -sS -o /dev/null -X DELETE -H "Authorization: Bearer $T" -H "Accept: application/vnd.github+json" \
    "https://api.github.com/orgs/$ORG/actions/runners/$RUNNER_ID" || true
fi
