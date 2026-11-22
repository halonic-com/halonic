#!/bin/bash
# One cycle of one runner slot (systemd halonic-runner@<slot>.service restarts it):
# mint a GitHub App token -> JIT config (one runner, one job) -> run a fresh container ->
# clean up. The App key never leaves this VM's root-only /etc/halonic-ci/app.pem.
set -euo pipefail
SLOT=${1:?slot, e.g. large-1}
PAUSED=/etc/halonic-ci/paused
# Paused: register no runner. systemd checks the units' ConditionPathExists only on a manual start,
# not on a Restart=always restart, so without this a slot kept taking jobs while the weekly cleanup
# and the hourly cache check waited for it. The sleep keeps a paused slot from restarting every 5 s.
# --cleanup (ExecStopPost) still runs: it only removes this slot's stale registrations.
if [ "${2:-}" != "--cleanup" ] && [ -e "$PAUSED" ]; then
  echo "slot ${SLOT}: paused ($PAUSED exists), not taking a job"
  sleep 30
  exit 0
fi
. /etc/halonic-ci/pool.env   # APP_ID INSTALLATION_ID ORG RUNNER_GROUP_ID IMAGE
KEY=/etc/halonic-ci/app.pem
TRUSTED=/cache/trusted; TRUSTED_PROJ=300; TRUSTED_QUOTA=20g
fail() { echo "slot ${SLOT}: $1" >&2; exit 1; }
# Fail closed: the App key must be a root-only 0400 file, not a link.
[ -f "$KEY" ] && [ ! -L "$KEY" ] || fail "$KEY missing or not a file"
[ "$(stat -c '%u %a' "$KEY")" = "0 400" ] || fail "$KEY must be owned by root with mode 0400"
case "$SLOT" in
  large-*) LABEL=halonic-ci-large; CPUS=6;  MEM=10g; MEM_START=4g; QUOTA=20g; TMPFS=1g ;;
  small-*) LABEL=halonic-ci-small; CPUS=2;  MEM=3g;  MEM_START=2g; QUOTA=6g;  TMPFS=512m ;;
  fast-[1-3]) LABEL=halonic-ci-fast; CPUS=6; MEM=10g; MEM_START=4g; QUOTA=20g; TMPFS=1g ;;
  *) echo "unknown slot $SLOT" >&2; exit 2 ;;
esac
N=${SLOT##*-}
case "$SLOT" in large-*) PROJ=$((100+N));; small-*) PROJ=$((200+N));; fast-*) PROJ=$((400+N));; esac
# Each slot gets its own CPUs, so a job sees only those (nproc, Node's availableParallelism).
# With --cpus alone it saw all of the VM's, and test runners started a worker per CPU and ran
# out of memory. vCPUs 2k and 2k+1 are SMT siblings, so 6 in a row are 3 whole cores.
# On the 80-vCPU VM, the eleven large slots take 0-65 and the three small slots share 66-71, each
# capped at 2 CPUs (--cpus). 72-79 stay free for the VM itself (Docker, systemd, the status feed).
# A fast slot takes the CPUs of a large slot from the top (fast-1 those of large-11, fast-2 of
# large-10, fast-3 of large-9), so run either one, never both.
case "$SLOT" in
  large-*) CPUSET="$(( (N-1)*6 ))-$(( N*6-1 ))" ;;
  small-*) CPUSET="66-71" ;;
  fast-*)  CPUSET="$(( (11-N)*6 ))-$(( (12-N)*6-1 ))" ;;
esac
# Fast slots take pull requests (HAL-15972), so they get their own pool config, and the other
# slots refuse to start with a config that would let a pull request in.
case "$SLOT" in
  fast-*) POOL_DIR=/etc/halonic-ci/pool-fast
          grep -qx 'POOL="fast"' "$POOL_DIR/pool.conf" || fail "$POOL_DIR/pool.conf must say POOL=\"fast\"" ;;
  *)      POOL_DIR=/etc/halonic-ci/pool
          if grep -Eq '^(POOL=.*fast|ALLOWED_EVENTS=.*pull_request)' "$POOL_DIR/pool.conf"; then
            fail "$POOL_DIR/pool.conf lets pull requests in; only fast slots take them"
          fi ;;
esac
# A fast slot's jobs are unreviewed code, so they never get the shared caches read-write (C2/C8).
# Each cache is an overlay: the shared folder is its read-only lower layer, and every write goes
# to an upper layer of this job's own, under the job's quota and deleted after it.
OVL=/cache/overlay/$SLOT; OVL_MNT=/run/halonic-ci-ovl/$SLOT; CACHES="pnpm-store turbo ms-playwright"
unmount_caches() {
  for c in $CACHES; do umount "$OVL_MNT/$c" 2>/dev/null || true; done
  rm -rf "$OVL" "$OVL_MNT"
}
[ "$LABEL" != halonic-ci-fast ] || unmount_caches

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
CACHE_SRC=$TRUSTED
if [ "$LABEL" = halonic-ci-fast ]; then
  for c in $CACHES; do
    install -d -m 0755 -o "$RUID" -g "$RUID" "$OVL/$c/upper"; install -d -m 0700 "$OVL/$c/work" "$OVL_MNT/$c"
  done
  xfs_quota -x -c "project -s -p $OVL $PROJ" /cache >/dev/null
  for c in $CACHES; do
    mount -t overlay overlay -o "lowerdir=$TRUSTED/$c,upperdir=$OVL/$c/upper,workdir=$OVL/$c/work" "$OVL_MNT/$c"
  done
  CACHE_SRC=$OVL_MNT
fi
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
  [ "$LABEL" != halonic-ci-fast ] || unmount_caches
}
trap cleanup EXIT
echo "slot $SLOT: runner $NAME (id $RUNNER_ID) waiting for a job"
STARTED=$(date +%s)
docker run --rm --name "hci-$SLOT" --hostname "$NAME" --init \
  --cpus "$CPUS" --cpuset-cpus "$CPUSET" --memory "$MEM_START" --memory-swap "$MEM_START" --pids-limit 8192 \
  --cap-drop ALL --security-opt no-new-privileges \
  --tmpfs "/tmp:rw,exec,nosuid,nodev,size=$TMPFS" \
  -v "$RUN:/run/halonic-ci:ro" \
  -v "$POOL_DIR:/etc/halonic-ci:ro" \
  -v /run/halonic-ci-gate:/run/halonic-ci-gate:ro \
  -v "$WORK:$JOB_WORK" \
  -v "$CACHE_SRC/pnpm-store:/cache/pnpm-store" \
  -v "$CACHE_SRC/turbo:/cache/turbo" \
  -v "$CACHE_SRC/ms-playwright:/cache/ms-playwright" \
  "$IMAGE" &
DPID=$!

# Sample the container every 3 s for the status feed: busy (a job's Runner.Worker is running),
# peak memory and CPU time from its cgroup. The only thing it changes is the job's memory limit (below).
JOB_START=0; PEAK=0; CPU_US=0; EV=""; REF=""; SHA=""
# memory.peak also counts file cache, which the kernel drops under pressure. ANON_PEAK is the highest
# sampled anon + shmem (process memory plus the /tmp tmpfs): what the job can't give back, so the
# number that decides how small a slot may be. Sampled every 3 s, so short spikes can be missed.
ANON_PEAK=0
# Dynamic memory (22 Nov 2026): a job starts at MEM_START and gets STEP more whenever its anon + shmem
# comes within HEAD of the limit, up to MEM, as long as the VM keeps RESERVE free. memory.high sits
# 512 MB under the limit, so the kernel reclaims cache and slows the job before the hard limit kills
# it, which gives this 3-second loop time to grow it. Every slot at MEM still fits the VM, so growth
# can't overcommit it; the reserve check matters once the VM is made smaller than that.
LIMIT_B=$(numfmt --from=iec "${MEM_START^^}"); MAX_B=$(numfmt --from=iec "${MEM^^}")
STEP_B=2147483648; HEAD_B=1610612736; RESERVE_B=4294967296; GROWS=0; HIGH_SET=""
write_state() {
  local now; now=$(date +%s)
  jq -nc --arg slot "$SLOT" --arg runner "$NAME" --arg label "$LABEL" --argjson up "$STARTED" \
    --argjson js "$JOB_START" --argjson peak "$PEAK" --argjson cpu "$CPU_US" --argjson now "$now" \
    --arg ev "$EV" --arg ref "$REF" --arg sha "$SHA" --argjson memlimit "$LIMIT_B" \
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
    anon=$(awk '$1=="anon"||$1=="shmem"{s+=$2} END{print s+0}' "$cg/memory.stat" 2>/dev/null || echo 0)
    [ "$anon" -gt "$ANON_PEAK" ] && ANON_PEAK=$anon
    if [ -z "$HIGH_SET" ]; then echo $((LIMIT_B - 536870912)) > "$cg/memory.high" 2>/dev/null && HIGH_SET=1; fi
    if [ $((anon + HEAD_B)) -gt "$LIMIT_B" ] && [ "$LIMIT_B" -lt "$MAX_B" ]; then
      avail=$(awk '$1=="MemAvailable:"{print $2*1024}' /proc/meminfo)
      if [ "${avail:-0}" -gt $((STEP_B + RESERVE_B)) ]; then
        new=$((LIMIT_B + STEP_B)); [ "$new" -gt "$MAX_B" ] && new=$MAX_B
        if docker update --memory "$new" --memory-swap "$new" "hci-$SLOT" >/dev/null 2>&1; then
          LIMIT_B=$new; GROWS=$((GROWS + 1))
          echo $((LIMIT_B - 536870912)) > "$cg/memory.high" 2>/dev/null || true
          echo "slot $SLOT: memory limit raised to $((LIMIT_B / 1048576)) MiB (anon+shmem $((anon / 1048576)) MiB)"
        fi
      else
        echo "slot $SLOT: memory not raised, VM has $((avail / 1048576)) MiB available"
      fi
    fi
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
  sleep 3
done
RC=0; wait "$DPID" || RC=$?
echo "slot $SLOT: container exited with $RC"
if [ "$JOB_START" != 0 ]; then
  END=$(date +%s)
  jq -nc --arg slot "$SLOT" --arg runner "$NAME" --arg label "$LABEL" --argjson s "$JOB_START" --argjson e "$END" \
    --argjson peak "$PEAK" --argjson cpu "$CPU_US" --argjson rc "$RC" --arg ev "$EV" --arg ref "$REF" --arg sha "$SHA" \
    --argjson memlimit "$LIMIT_B" --argjson cpus "$CPUS" --argjson anon "$ANON_PEAK" \
    --argjson memstart "$(numfmt --from=iec "${MEM_START^^}")" --argjson grows "$GROWS" \
    '{slot:$slot, runner:$runner, label:$label, event:$ev, ref:$ref, sha:$sha, started_at:$s, ended_at:$e,
      seconds:($e-$s), mem_peak:$peak, mem_anon_peak:$anon, mem_start:$memstart, mem_limit:$memlimit, mem_grows:$grows,
      cpu_seconds:($cpu/1000000|floor), cpus:$cpus, exit:$rc}' >> "$JOBLOG"
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
