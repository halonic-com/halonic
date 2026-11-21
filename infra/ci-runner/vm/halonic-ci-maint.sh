#!/bin/bash
# Weekly cleanup inside the CI VM: dangling images/build cache, stale work dirs, and the
# shared caches when /cache passes 75 %.
set -u
docker image prune -f >/dev/null; docker builder prune -af >/dev/null
for d in /cache/work/*; do [ -d "$d" ] || continue; s=${d##*/}; systemctl is-active -q "halonic-runner@$s" || rm -rf "$d"; done
use=$(df --output=pcent /cache | tail -1 | tr -dc 0-9)
if [ "$use" -gt 75 ]; then
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
fi
logger -t halonic-ci-maint "done, /cache was ${use}%"
