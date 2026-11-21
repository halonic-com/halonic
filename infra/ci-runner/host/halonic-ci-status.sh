#!/bin/bash
# Host side of the read-only CI status feed (timer, every minute). Asks the CI VM for its status
# with a key that can run only the status command, and writes it world-readable to
# /srv/ci/status/ci-status.json (plus jobs.jsonl = all finished jobs seen, deduplicated).
# Nothing here can change the VM; readers (server dashboard, board inbox, agents) only read files.
set -u
OUT=/srv/ci/status
install -d -m 0755 "$OUT"
now=$(date +%s)
state=$(virsh -c qemu:///system domstate halonic-ci 2>/dev/null | head -1)
if j=$(timeout 20 ssh -o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=yes \
        -i /root/.ssh/halonic_ci_status ciadmin@10.77.0.10 2>/dev/null) && jq -e .schema >/dev/null 2>&1 <<<"$j"; then  # leak-guard: allow absolute-path the host root's status key
  jq -c --arg st "$state" '. + {vm_state:$st, ok:true}' <<<"$j" > "$OUT/.ci-status.tmp"
  # append finished jobs we haven't stored yet (match on runner name)
  touch "$OUT/jobs.jsonl"
  jq -c '.recent_jobs | reverse | .[]' <<<"$j" | while read -r line; do
    r=$(jq -r .runner <<<"$line")
    grep -q "\"runner\":\"$r\"" "$OUT/jobs.jsonl" || echo "$line" >> "$OUT/jobs.jsonl"
  done
  # keep the last 5000 jobs
  if [ "$(wc -l < "$OUT/jobs.jsonl")" -gt 6000 ]; then
    tail -n 5000 "$OUT/jobs.jsonl" > "$OUT/.jobs.tmp" && mv -f "$OUT/.jobs.tmp" "$OUT/jobs.jsonl"
  fi
  chmod 644 "$OUT/jobs.jsonl"
else
  jq -nc --argjson now "$now" --arg st "$state" '{schema:1, generated_at:$now, ok:false, vm_state:$st, error:"CI VM did not answer"}' > "$OUT/.ci-status.tmp"
fi
chmod 644 "$OUT/.ci-status.tmp" && mv -f "$OUT/.ci-status.tmp" "$OUT/ci-status.json"
