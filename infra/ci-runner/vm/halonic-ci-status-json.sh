#!/bin/bash
# Prints the CI pool's status as one JSON document (read-only). Run on the VM as root; the host
# calls it over SSH with a key that can run nothing else (forced command), every minute.
set -u
now=$(date +%s)
conf() { sed -n "s/^$1=\(.*\)$/\1/p" /etc/halonic-ci/pool/pool.conf | tail -1 | tr -d '"'; }
. /etc/halonic-ci/pool.env 2>/dev/null || true

slots_json=$(for u in $(cat /etc/halonic-ci/slots); do
  s=${u#halonic-runner@}
  st=$(systemctl is-active "$u" 2>/dev/null || true)
  f=/run/halonic-ci/$s.state
  if [ -s "$f" ]; then jq -c --arg st "$st" '. + {unit:$st}' "$f"
  else jq -nc --arg s "$s" --arg st "$st" '{slot:$s, unit:$st, busy:false, runner:null}'; fi
done | jq -s 'sort_by(.slot)')

recent=$( [ -s /var/log/halonic-ci/jobs.jsonl ] && tail -n 200 /var/log/halonic-ci/jobs.jsonl | jq -s 'reverse' || echo '[]')

read -r l1 l5 l15 _ < /proc/loadavg
mt=$(awk '/^MemTotal:/{print $2*1024}' /proc/meminfo); ma=$(awk '/^MemAvailable:/{print $2*1024}' /proc/meminfo)
df_json() { df -B1 --output=size,used "$1" | tail -1 | awk '{printf "{\"size\":%s,\"used\":%s}", $1, $2}'; }

jq -nc --argjson now "$now" --argjson slots "$slots_json" --argjson recent "$recent" \
  --arg events "$(conf ALLOWED_EVENTS)" --arg smoke "$(conf SMOKE_BRANCH)" \
  --argjson paused "$([ -e /etc/halonic-ci/paused ] && echo true || echo false)" \
  --arg image "${IMAGE:-}" --argjson ncpu "$(nproc)" \
  --argjson l1 "$l1" --argjson l5 "$l5" --argjson l15 "$l15" --argjson mt "$mt" --argjson ma "$ma" \
  --argjson cache "$(df_json /cache)" --argjson root "$(df_json /)" \
  --argjson up "$(cut -d. -f1 /proc/uptime)" \
  '{schema:1, generated_at:$now,
    pool:{allowed_events:($events|split(" ")|map(select(.!=""))), smoke_branch:(if $smoke=="" then null else $smoke end),
          paused:$paused, image:$image, slots_total:($slots|length),
          slots_busy:($slots|map(select(.busy))|length), slots_up:($slots|map(select(.unit=="active"))|length)},
    vm:{vcpus:$ncpu, load:[$l1,$l5,$l15], mem_total:$mt, mem_available:$ma, uptime_seconds:$up,
        disk_cache:$cache, disk_root:$root},
    slots:$slots, recent_jobs:$recent}'
