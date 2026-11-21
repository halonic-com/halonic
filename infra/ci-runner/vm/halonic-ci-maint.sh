#!/bin/bash
# Weekly cleanup inside the CI VM: dangling images/build cache, stale work dirs, and the
# shared caches when /cache passes 75 %.
set -u
docker image prune -f >/dev/null; docker builder prune -af >/dev/null
for d in /cache/work/*; do [ -d "$d" ] || continue; s=${d##*/}; systemctl is-active -q "halonic-runner@$s" || rm -rf "$d"; done
use=$(df --output=pcent /cache | tail -1 | tr -dc 0-9)
if [ "$use" -gt 75 ]; then
  systemctl stop 'halonic-runner@*'
  rm -rf /cache/trusted/pnpm-store/* /cache/trusted/ms-playwright/*
  systemctl start $(cat /etc/halonic-ci/slots)
fi
logger -t halonic-ci-maint "done, /cache was ${use}%"
