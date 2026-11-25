#!/bin/bash
# One cycle of one runner slot (systemd halonic-runner@<slot>.service restarts it):
# mint a GitHub App token -> JIT config (one runner, one job) -> run a fresh container ->
# clean up. The App key never leaves this VM's root-only /etc/halonic-ci/app.pem.
set -euo pipefail
SLOT=${1:?slot, e.g. large-1}
PAUSED=/etc/halonic-ci/paused
STATES=/run/halonic-ci
# --cleanup (ExecStopPost) removes this slot's state first, before anything below that can fail
# (pool.env, the App key, a GitHub token): a state left behind would count as promised memory for
# the fast slots (HAL-17558), as large-10's did for two days after it was disabled. If that fails, the
# rest of the cleanup (stale registrations) still runs.
if [ "${2:-}" = "--cleanup" ]; then
  rm -f "$STATES/$SLOT.state" || echo "slot $SLOT: could not remove $STATES/$SLOT.state" >&2
fi
# Paused: register no runner. systemd checks the units' ConditionPathExists only on a manual start,
# not on a Restart=always restart, so without this a slot kept taking jobs while the weekly cleanup
# and the hourly cache check waited for it. The sleep keeps a paused slot from restarting every 5 s.
# --cleanup (ExecStopPost) still runs: it only removes this slot's stale registrations.
if [ "${2:-}" != "--cleanup" ] && [ -e "$PAUSED" ]; then
  echo "slot ${SLOT}: paused ($PAUSED exists), not taking a job"
  sleep 30
  exit 0
fi
fail() { echo "slot ${SLOT}: $1" >&2; exit 1; }
# A fast slot runs unreviewed code (HAL-15972), so only under gVisor (runsc), which gives the job a
# kernel of its own in user space: a kernel bug the job finds doesn't reach this VM, the App key or
# the merge-group jobs (C8). It also gets its own Docker network, where containers can't reach each
# other or the merge-group jobs on the default bridge. Checked first: without both, no fast runner.
FAST_NET=halonic-ci-fast
FAST_FLOAT=""  # set below when fast-11..40 may float over the free cores (HAL-17574)
FAST_GATES=/run/halonic-ci-gate-fast  # one gate socket per fast slot, in a folder named after it
# fast-N and large-(12-N) share CPUs (below), so one never starts while the other runs.
case "$SLOT" in fast-[1-3]) TWIN=large-$((12-${SLOT#fast-}));; large-9|large-10|large-11) TWIN=fast-$((12-${SLOT#large-}));; *) TWIN="";; esac
if [ -n "$TWIN" ] && [ "${2:-}" != "--cleanup" ] && systemctl is-active -q "halonic-runner@$TWIN.service"; then
  fail "$TWIN runs on the same CPUs; stop and disable it first"
fi
if [[ "$SLOT" == fast-* ]] && [ "${2:-}" != "--cleanup" ]; then
  rts=" $(docker info --format '{{range $k, $v := .Runtimes}}{{$k}} {{end}}' 2>/dev/null || true) "
  [[ "$rts" == *" runsc "* ]] || fail "Docker has no runsc runtime (gVisor); fast slots run only under it"
  read -r icc subnet _ <<<"$(docker network inspect -f '{{index .Options "com.docker.network.bridge.enable_icc"}} {{range .IPAM.Config}}{{.Subnet}} {{end}}' "$FAST_NET" 2>/dev/null || true)"
  [ "$icc" = false ] || fail "Docker network $FAST_NET missing or lets containers reach each other"
  # One address per fast container plus the gateway. Created from Docker's default pools it was a /28
  # (13 addresses), which held the pool at 13 jobs on 24 Nov (HAL-17574): /26 is the least for 40.
  if ! [[ "$subnet" =~ ^[0-9.]+/([0-9]+)$ ]] || [ "${BASH_REMATCH[1]}" -gt 26 ]; then
    fail "Docker network $FAST_NET has ${subnet:-no IPv4 subnet}, too small for 40 fast containers; recreate it with --subnet <a /24>"
  fi
  # gVisor tells the job it has as many CPUs as its --cpus quota, not its CPU set (HAL-17574, below).
  rargs=$(docker info --format '{{json (index .Runtimes "runsc")}}' 2>/dev/null || true)
  if [[ "$rargs" =~ \"--cpu-num-from-quota(=true)?\" ]]; then FAST_FLOAT=1; fi
  [ -S "$FAST_GATES/$SLOT/gate.sock" ] || fail "no gate socket of its own; enable halonic-ci-gate-fast@$SLOT.socket"
fi
. /etc/halonic-ci/pool.env   # APP_ID INSTALLATION_ID ORG RUNNER_GROUP_ID IMAGE
KEY=/etc/halonic-ci/app.pem
TRUSTED=/cache/trusted; TRUSTED_PROJ=300; TRUSTED_QUOTA=20g
# Fail closed: the App key must be a root-only 0400 file, not a link.
[ -f "$KEY" ] && [ ! -L "$KEY" ] || fail "$KEY missing or not a file"
[ "$(stat -c '%u %a' "$KEY")" = "0 400" ] || fail "$KEY must be owned by root with mode 0400"
case "$SLOT" in
  large-*) LABEL=halonic-ci-large; CPUS=6;  MEM=16g; MEM_START=6g; QUOTA=20g; TMPFS=1g ;;
  small-*) LABEL=halonic-ci-small; CPUS=2;  MEM=3g;  MEM_START=2g; QUOTA=6g;  TMPFS=512m ;;
  fast-[1-9]|fast-10) LABEL=halonic-ci-fast; CPUS=6; MEM=16g; MEM_START=4g; QUOTA=20g; TMPFS=1g ;;
  fast-1[1-9]|fast-[23][0-9]|fast-40) LABEL=halonic-ci-fast; CPUS=4; MEM=12g; MEM_START=4g; QUOTA=20g; TMPFS=1g ;;
  *) echo "unknown slot $SLOT" >&2; exit 2 ;;
esac
N=${SLOT##*-}
SHARES=1024; [ "$LABEL" != halonic-ci-large ] || SHARES=2048
# Fast jobs' memory is counted less strictly than their limits (memory admission, below), so if the
# VM ever runs out, the kernel kills a fast job (its PR re-runs) before a merge-group job.
OOM_ADJ=0; [ "$LABEL" != halonic-ci-fast ] || OOM_ADJ=500
case "$SLOT" in large-*) PROJ=$((100+N));; small-*) PROJ=$((200+N));; fast-*) PROJ=$((400+N));; esac
# Each slot gets its own CPUs, so a job sees only those (nproc, Node's availableParallelism).
# With --cpus alone it saw all of the VM's, and test runners started a worker per CPU and ran
# out of memory. vCPUs 2k and 2k+1 are SMT siblings, so 6 in a row are 3 whole cores.
# On the 112-vCPU VM (since 22 Nov 2026, 16 cores moved from Paperclip), the eleven large slots take
# 0-65, the three small slots share 66-71, each capped at 2 CPUs (--cpus), large-15..19 take 72-101,
# and 102-111 stay free for the VM itself (Docker, systemd, the status feed).
# fast-1..3 take the CPUs of a large slot from the top (fast-1 those of large-11, fast-2 of
# large-10, fast-3 of large-9), so run either one, never both (checked at the top). fast-4..8 share
# the CPUs of large-15..19, and fast-9 (15-20) and fast-10 (39-44) straddle two large slots each, as
# large-12..14 do: on purpose, since fast slots sit idle between pull requests; when both are busy,
# both run slower.
# fast-11..24 (HAL-17463, every person's pull request) get 4 CPUs each, GitHub's runner size, as two
# whole cores. Each shares them with one to three large slots and none with another new fast slot;
# fast-11..17 share them with no older fast slot, fast-18..24 each with one (4 of its 6). No twin
# rule for them, as for fast-4..10: a large slot and a fast slot on the same cores both run slower.
# fast-25..40 (HAL-17574) are 16 more of the same size. With 40 fast slots the pinned sets ask for
# 276 vCPUs on the 96 outside the small slots' and the VM's, so no fixed map keeps every core at two
# slots: most would carry three and some four, while other cores sit idle. So fast-11..40 float:
# their CPU set is all of FAST_WIDE and --cpus 4 is their quota, and the kernel runs them on whichever
# cores are free. The job still sees 4 CPUs, because runsc runs with --cpu-num-from-quota (checked at
# the top; Docker's daemon.json runtimeArgs). Without that flag a job would see 96 CPUs and start a
# test worker for each, so they keep a fixed 4-vCPU set (FAST4_FROM) instead. Large slots get twice
# the CPU weight (--cpu-shares), so a merge-group job wins the cores it shares with fast jobs.
FAST4_FROM=(0 4 8 22 26 30 34 50 56 62 74 80 86 92 46 12 58 18 36 42 22 62 96 10 48 0 32 54 14 38)
FAST_WIDE="0-65,72-101"
case "$SLOT" in
  large-12) CPUSET="3-8" ;;
  large-13) CPUSET="27-32" ;;
  large-14) CPUSET="51-56" ;;
  large-1[5-9]) CPUSET="$(( 72+(N-15)*6 ))-$(( 77+(N-15)*6 ))" ;;
  large-*) CPUSET="$(( (N-1)*6 ))-$(( N*6-1 ))" ;;
  small-*) CPUSET="66-71" ;;
  fast-[4-8]) CPUSET="$(( 72+(N-4)*6 ))-$(( 77+(N-4)*6 ))" ;;
  fast-9)  CPUSET="15-20" ;;
  fast-10) CPUSET="39-44" ;;
  fast-1[1-9]|fast-[23][0-9]|fast-40)
           if [ -n "${FAST_FLOAT:-}" ]; then CPUSET=$FAST_WIDE; else CPUSET="${FAST4_FROM[N-11]}-$(( FAST4_FROM[N-11]+3 ))"; fi ;;
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
# Each cache is an overlay: a snapshot of the shared folder is its read-only lower layer, and every
# write goes to an upper layer of this job's own, under the job's quota and deleted after it. Not the
# shared folder itself: merge-group jobs write to it, and a lower layer must not change while it's
# mounted (HAL-16032). vm/halonic-ci-fast-lower.sh makes the snapshots.
OVL=/cache/overlay/$SLOT; OVL_MNT=/run/halonic-ci-ovl/$SLOT; CACHES="pnpm-store turbo ms-playwright"
FAST_LOWER=/usr/local/sbin/halonic-ci-fast-lower.sh; FAST_LOWER_LOCK=/cache/fast-lower/.lock
unmount_caches() {
  for c in $CACHES; do umount "$OVL_MNT/$c" 2>/dev/null || true; done
  rm -rf "$OVL" "$OVL_MNT"
}
[ "$LABEL" != halonic-ci-fast ] || unmount_caches

# Memory admission (HAL-17463): the fast slots' start sizes add up to more than the VM has (24 slots,
# 96 GB of limits on a 72 GB VM), and the reserve check further down only stops growth. So a fast
# slot registers a runner only while the VM can still give it its start size plus the reserve, after
# what it has already promised: the start size of every idle fast runner, and the room every busy job
# still has under its limit (from the slots' state files). Under a lock, and this slot's own state is
# written before it's released, so two slots can't both count the same memory. Large and small
# slots are never held back: merge groups keep the memory first. A fast slot that waits registers
# nothing, so its jobs wait in GitHub's queue for a fast runner that can take them.
# A running slot rewrites its state every 2 s, so a state not updated for STALE_S seconds, or with no
# updated_at, belongs to a slot that is gone and promises nothing (HAL-17558).
# A busy job promises at most BUSY_ROOM_B beyond what it uses now (anon + shmem; memory.peak from an
# older state), not all the way to its limit (HAL-17574): the limit grows 4 GB at a time, so after a
# raise a job that peaks at 3-4 GB held 4-5 GB back, and 24 fast slots on 96 GB topped out at 16-18
# jobs. 2 GB is the margin the growth loop keeps under the limit anyway (HEAD_B). Jobs that do grow
# past it are covered by the reserve, and by the OOM priority above if not.
MEMINFO=/proc/meminfo; RESERVE_B=4294967296; STALE_S=120; BUSY_ROOM_B=2147483648
fast_room() {
  local avail promised
  avail=$(awk '$1=="MemAvailable:"{print $2*1024}' "$MEMINFO")
  promised=$(cat "$STATES"/*.state 2>/dev/null | jq -s --arg me "$SLOT" --argjson now "$(date +%s)" --argjson stale "$STALE_S" \
      --argjson busyroom "$BUSY_ROOM_B" '[.[]
      | select(.slot != $me and (.updated_at | type) == "number" and $now - .updated_at <= $stale)
      | if .busy then [(.mem_limit // 0) - (.mem_anon // .mem_peak // 0), $busyroom] | min
        elif .label == "halonic-ci-fast" then .mem_limit // 0 else 0 end
      | if . > 0 then . else 0 end] | add // 0') || return 1
  [[ "$avail" =~ ^[0-9]+$ ]] && [[ "$promised" =~ ^[0-9]+$ ]] || return 1
  echo $((avail - promised))
}
if [ "$LABEL" = halonic-ci-fast ] && [ "${2:-}" != "--cleanup" ]; then
  install -d -m 0755 "$STATES"
  NEED_B=$(( $(numfmt --from=iec "${MEM_START^^}") + RESERVE_B ))
  until (
    flock 8
    room=$(fast_room) || exit 1
    [ "$room" -ge "$NEED_B" ] || exit 1
    jq -nc --arg slot "$SLOT" --arg label "$LABEL" --argjson limit "$((NEED_B - RESERVE_B))" --argjson now "$(date +%s)" \
      '{slot:$slot, runner:null, label:$label, registered_at:$now, busy:false, mem_peak:0, mem_limit:$limit, updated_at:$now}' \
      > "$STATES/$SLOT.state"
  ) 8>"$STATES/fast-admit.lock"; do
    [ ! -e "$PAUSED" ] || exit 0
    echo "slot $SLOT: waiting for memory (needs $((NEED_B / 1048576)) MiB the VM hasn't promised yet)"
    sleep 15
  done
fi

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
now=$(date +%s)
hdr=$(printf '{"alg":"RS256","typ":"JWT"}' | b64url)
pl=$(printf '{"iat":%d,"exp":%d,"iss":"%s"}' $((now-60)) $((now+540)) "$APP_ID" | b64url)
sig=$(printf '%s.%s' "$hdr" "$pl" | openssl dgst -sha256 -sign "$KEY" -binary | b64url)
JWT="$hdr.$pl.$sig"
# An installation token, minted from a fresh JWT (the first one may have expired by the job's end).
app_token() {
  local now pl sig
  now=$(date +%s)
  pl=$(printf '{"iat":%d,"exp":%d,"iss":"%s"}' $((now-60)) $((now+540)) "$APP_ID" | b64url)
  sig=$(printf '%s.%s' "$hdr" "$pl" | openssl dgst -sha256 -sign "$KEY" -binary | b64url)
  api -X POST -H "Authorization: Bearer $hdr.$pl.$sig" "https://api.github.com/app/installations/$INSTALLATION_ID/access_tokens" | jq -r .token
}
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
# --cleanup removed this slot's state at the top, so a cycle that ended before its own clean-up ran
# leaves no promise behind (memory admission, above).
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
  "$FAST_LOWER" current >/dev/null   # makes the first snapshot, if there is none yet
  # Held shared until mounted, so the hourly refresh can't delete the snapshot in between.
  (
    flock -s 9
    LOWER_GEN=$("$FAST_LOWER" current)
    for c in $CACHES; do
      mount -t overlay overlay -o "lowerdir=$LOWER_GEN/$c,upperdir=$OVL/$c/upper,workdir=$OVL/$c/work" "$OVL_MNT/$c"
      # Under gVisor the job sees every mount as its file proxy's, so only here can it be checked.
      [ "$(findmnt -n -o FSTYPE --mountpoint "$OVL_MNT/$c")" = overlay ] || fail "$OVL_MNT/$c is not an overlay"
    done
  ) 9>"$FAST_LOWER_LOCK"
  # The generation this slot mounted, for the idle check below (HAL-18424).
  MOUNTED_GEN=$(findmnt -n -o OPTIONS --mountpoint "$OVL_MNT/turbo" | grep -o 'lowerdir=[^,]*' | sed 's|^lowerdir=||; s|/turbo$||; s|.*/||')
  [[ "$MOUNTED_GEN" =~ ^[0-9]+$ ]] || fail "can't tell which snapshot $OVL_MNT/turbo mounts"
  CACHE_SRC=$OVL_MNT
fi
# What only a fast slot's container gets: gVisor, its own network and its own gate socket, which
# answers pull request queries only, so its jobs can't hold the merge queue's gate (HAL-15972), nor
# another fast slot's (halonic-ci-gate-fast@<slot>.socket, HAL-17473).
SANDBOX=(); GATE_DIR=/run/halonic-ci-gate
if [ "$LABEL" = halonic-ci-fast ]; then
  # Docker's embedded DNS (127.0.0.11, which a user-defined network writes into resolv.conf) is
  # unreachable from gVisor's network stack, so a fast container gets a resolv.conf of its own naming
  # the two resolvers the VM's firewall already allows.
  printf 'nameserver 1.1.1.1\nnameserver 1.0.0.1\n' > "$RUN/resolv.conf"; chown "$RUID:$RUID" "$RUN/resolv.conf"; chmod 0444 "$RUN/resolv.conf"
  SANDBOX=(--runtime=runsc --network="$FAST_NET" -v "$RUN/resolv.conf:/etc/resolv.conf:ro"); GATE_DIR=$FAST_GATES/$SLOT
fi
# The shared caches get one project quota too (set once: new files inherit the project).
(
  flock 9
  if ! xfs_io -c lsproj "$TRUSTED" 2>/dev/null | grep -qx "projid = $TRUSTED_PROJ"; then
    xfs_quota -x -c "project -s -p $TRUSTED $TRUSTED_PROJ" /cache >/dev/null
  fi
  xfs_quota -x -c "limit -p bhard=$TRUSTED_QUOTA $TRUSTED_PROJ" /cache >/dev/null
) 9>/run/halonic-ci/trusted-quota.lock

STATE=$STATES/$SLOT.state; JOBLOG=/var/log/halonic-ci/jobs.jsonl
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
  --cpus "$CPUS" --cpuset-cpus "$CPUSET" --cpu-shares "$SHARES" --oom-score-adj "$OOM_ADJ" --memory "$MEM_START" --memory-swap "$MEM_START" --pids-limit 8192 \
  --cap-drop ALL --security-opt no-new-privileges "${SANDBOX[@]}" \
  --tmpfs "/tmp:rw,exec,nosuid,nodev,size=$TMPFS" \
  -v "$RUN:/run/halonic-ci:ro" \
  -v "$POOL_DIR:/etc/halonic-ci:ro" \
  -v "$GATE_DIR:/run/halonic-ci-gate:ro" \
  -v "$WORK:$JOB_WORK" \
  -v "$CACHE_SRC/pnpm-store:/cache/pnpm-store" \
  -v "$CACHE_SRC/turbo:/cache/turbo" \
  -v "$CACHE_SRC/ms-playwright:/cache/ms-playwright" \
  "$IMAGE" &
DPID=$!

# Sample the container every 2 s for the status feed: busy (a job's Runner.Worker is running),
# peak memory and CPU time from its cgroup. The only thing it changes is the job's memory limit (below).
JOB_START=0; PEAK=0; ANON=0; CPU_US=0; EV=""; REF=""; SHA=""
# memory.peak also counts file cache, which the kernel drops under pressure. ANON_PEAK is the highest
# sampled anon + shmem (process memory plus the /tmp tmpfs): what the job can't give back, so the
# number that decides how small a slot may be. Sampled every 2 s, so short spikes can be missed.
ANON_PEAK=0
# Dynamic memory (22 Nov 2026): a job starts at MEM_START and gets STEP more whenever its anon + shmem
# comes within HEAD of the limit, up to MEM, as long as the VM keeps RESERVE free. memory.high sits
# 512 MB under the limit, so the kernel reclaims cache and slows the job before the hard limit kills
# it, which gives this 2-second loop time to grow it. All slots at MEM would overcommit the VM, so
# the reserve check is the only thing that stops growth from doing that.
LIMIT_B=$(numfmt --from=iec "${MEM_START^^}"); MAX_B=$(numfmt --from=iec "${MEM^^}")
STEP_B=4294967296; HEAD_B=2147483648; GROWS=0; HIGH_SET=""  # RESERVE_B: memory admission, above
# An idle fast slot on a snapshot older than STALE_GEN_S, with a newer one published, gives up its
# runner and restarts on the new one (HAL-18424): a slot can wait an hour for a job, and its job would
# miss every cache entry written since. Only while no job runs: GitHub refuses to delete a runner that
# has taken one (422), and only after that refusal can't happen is the container stopped.
# Past WARN_GEN_S an idle slot says so every check: the restart isn't happening (no newer snapshot, or
# GitHub won't delete the runner), and its next job would read old caches.
STALE_GEN_S=600; WARN_GEN_S=1800; GEN_CHECKED=0
idle_on_stale_snapshot() {
  local now cur
  [ "$LABEL" = halonic-ci-fast ] && [ "$JOB_START" = 0 ] || return 1
  now=$(date +%s); [ $((now - GEN_CHECKED)) -ge 60 ] || return 1; GEN_CHECKED=$now
  if [ $((now - MOUNTED_GEN)) -gt "$WARN_GEN_S" ]; then
    echo "slot $SLOT: warning: idle on snapshot $MOUNTED_GEN, $(( (now - MOUNTED_GEN) / 60 )) minutes old" >&2
  fi
  [ $((now - MOUNTED_GEN)) -gt "$STALE_GEN_S" ] || return 1
  cur=$(readlink /cache/fast-lower/current 2>/dev/null) || return 1
  [[ "$cur" =~ ^[0-9]+$ ]] && [ "$cur" -gt "$MOUNTED_GEN" ]
}
release_idle_runner() {
  local t
  t=$(app_token) && [ -n "$t" ] && [ "$t" != null ] || return 1
  curl -fsS -o /dev/null -X DELETE -H "Authorization: Bearer $t" -H "Accept: application/vnd.github+json" \
    "https://api.github.com/orgs/$ORG/actions/runners/$RUNNER_ID"
}
write_state() {
  local now; now=$(date +%s)
  jq -nc --arg slot "$SLOT" --arg runner "$NAME" --arg label "$LABEL" --argjson up "$STARTED" \
    --argjson js "$JOB_START" --argjson peak "$PEAK" --argjson anon "$ANON" --argjson cpu "$CPU_US" --argjson now "$now" \
    --arg ev "$EV" --arg ref "$REF" --arg sha "$SHA" --argjson memlimit "$LIMIT_B" \
    '{slot:$slot, runner:$runner, label:$label, registered_at:$up, busy:($js>0),
      job_started_at:(if $js>0 then $js else null end), job_seconds:(if $js>0 then $now-$js else null end),
      event:(if $ev=="" then null else $ev end), ref:(if $ref=="" then null else $ref end), sha:(if $sha=="" then null else $sha end),
      mem_peak:$peak, mem_anon:$anon, mem_limit:$memlimit, cpu_seconds:($cpu/1000000|floor), updated_at:$now}' > "$STATE.tmp" \
    && mv -f "$STATE.tmp" "$STATE"
}
while kill -0 "$DPID" 2>/dev/null; do
  cid=$(docker inspect -f '{{.Id}}' "hci-$SLOT" 2>/dev/null || true)
  cg=/sys/fs/cgroup/system.slice/docker-$cid.scope
  if [ -n "$cid" ] && [ -d "$cg" ]; then
    PEAK=$(cat "$cg/memory.peak" 2>/dev/null || echo "$PEAK")
    CPU_US=$(awk '$1=="usage_usec"{print $2}' "$cg/cpu.stat" 2>/dev/null || echo "$CPU_US")
    anon=$(awk '$1=="anon"||$1=="shmem"{s+=$2} END{print s+0}' "$cg/memory.stat" 2>/dev/null || echo 0)
    ANON=$anon; [ "$anon" -gt "$ANON_PEAK" ] && ANON_PEAK=$anon
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
    # Under gVisor the VM sees only the sandbox's own processes (gvisor_sentry, exe), so a fast
    # slot asks inside the container, as the runner user, until its job has started.
    if [ "$JOB_START" = 0 ] && [ "$LABEL" = halonic-ci-fast ]; then
      procs=$(timeout 5 docker exec "hci-$SLOT" timeout 3 sh -c 'cat /proc/[0-9]*/comm' 2>/dev/null || true)
    fi
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
  if idle_on_stale_snapshot && release_idle_runner; then
    echo "slot $SLOT: idle on snapshot $MOUNTED_GEN, restarting on a newer one"
    docker rm -f "hci-$SLOT" >/dev/null 2>&1 || true
    RUNNER_ID=""
  fi
  sleep 2
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
  T=$(app_token) || T=
  [ -n "$T" ] && curl -sS -o /dev/null -X DELETE -H "Authorization: Bearer $T" -H "Accept: application/vnd.github+json" \
    "https://api.github.com/orgs/$ORG/actions/runners/$RUNNER_ID" || true
fi
