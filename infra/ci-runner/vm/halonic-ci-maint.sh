#!/bin/bash
# Cleanup inside the CI VM. Weekly: dangling images/build cache and stale work dirs. Weekly and
# hourly (--caches): empty the shared caches when /cache passes 75 % or the caches' own quota
# (XFS project 300, 20 GB) passes 80 %, before a full quota fails every install.
set -u
if [ "${1:-}" != "--caches" ]; then
  docker image prune -f >/dev/null; docker builder prune -af >/dev/null
  for d in /cache/work/*; do [ -d "$d" ] || continue; s=${d##*/}; systemctl is-active -q "halonic-runner@$s" || rm -rf "$d"; done
fi
use=$(df --output=pcent /cache | tail -1 | tr -dc 0-9)
# report -n: "#300 <used KiB> <soft> <hard KiB> ..."; no project 300 yet reads as 0 %.
read -r tused thard < <(xfs_quota -x -c 'report -p -b -N -n' /cache 2>/dev/null | awk '$1=="#300"{print $2, $4; exit}')
tuse=0; [ "${thard:-0}" -gt 0 ] 2>/dev/null && tuse=$((tused * 100 / thard))
if [ "${use:-0}" -gt 75 ] || [ "$tuse" -ge 80 ]; then
  # Pause: a slot doesn't start its next cycle while /etc/halonic-ci/paused exists. Stop idle
  # slots, let busy ones finish their job (up to 2 hours), then empty the caches.
  touch /etc/halonic-ci/paused
  for _ in $(seq 720); do
    active=$(systemctl list-units --state=active --plain --no-legend 'halonic-runner@*' | awk '{print $1}')
    [ -n "$active" ] || break
    for u in $active; do
      s=${u#halonic-runner@}; s=${s%.service}
      jq -e '.busy' "/run/halonic-ci/$s.state" >/dev/null 2>&1 || systemctl stop "$u"
    done
    sleep 10
  done
  systemctl stop 'halonic-runner@*'
  rm -rf /cache/trusted/pnpm-store/* /cache/trusted/ms-playwright/*
  rm -f /etc/halonic-ci/paused
  systemctl start $(cat /etc/halonic-ci/slots)
  logger -t halonic-ci-maint "emptied the shared caches, /cache was ${use}%, caches ${tuse}% of quota"
fi
logger -t halonic-ci-maint "done, /cache was ${use}%, caches ${tuse}% of quota"
