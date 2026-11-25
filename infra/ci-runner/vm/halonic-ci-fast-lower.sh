#!/bin/bash
# The fast pool's read-only copy of the shared caches (HAL-16032, Julian's N1 on HAL-15972).
# A fast slot's overlay must not use /cache/trusted itself as its lower layer: merge-group jobs keep
# writing there, and a lower layer that changes under a mounted overlay is undefined behaviour, so a
# fast-track job could read a half-written pnpm or Turbo entry. Instead each overlay mounts one
# generation under $LOWER/<n>, which nothing changes once it's published.
#   refresh  copy /cache/trusted into a new generation and make it current (hourly, after the cache check)
#   current  print the current generation's folder, making the first one if there is none
#   timer    what the 5-minute timer runs (HAL-18424): refresh unless no fast slot is deployed or the
#            weekly cleanup or hourly check holds their lock, log why a round was skipped, and fail
#            loudly when the current generation is older than MAX_AGE
# A slot holds $LOWER/.lock shared from reading `current` until its overlays are mounted; refresh
# holds it exclusive only to switch and to delete generations no overlay mounts any more. One refresh
# at a time ($LOWER/.refresh.lock): the hourly one and a slot making the first one may meet.
set -euo pipefail
TRUSTED=/cache/trusted
LOWER=/cache/fast-lower
MOUNTS=/proc/self/mountinfo
SUBUID=/etc/subuid
CACHES="pnpm-store turbo ms-playwright"
# A file whose inode changed less than this long before the copy started may still be being
# written. ctime, not mtime: tar and pnpm set mtime, nothing in user space sets ctime.
SETTLE=120
SLOTS=/etc/halonic-ci/slots
MAINT_LOCK=/run/lock/halonic-ci-maint.lock
# Fast slots should never read a snapshot older than this; past it the timer's unit fails (HAL-18424).
MAX_AGE=1800

# Jobs write /cache/trusted as the runner's uid, so they can swap a folder for a link to any VM file
# while it's being copied. Copy and clean up as that uid, never as root: a link then reaches only
# what jobs could read anyway, never the App key or the gate's token.
cache_uid() {
  local base
  base=$(awk -F: '$1=="dockremap"{print $2; exit}' "$SUBUID")
  [[ "$base" =~ ^[1-9][0-9]*$ ]] || { echo "fast-lower: no dockremap range in $SUBUID" >&2; exit 1; }
  echo $((base + 1001))
}
as_cache_user() { setpriv --reuid="$RUID" --regid="$RUID" --clear-groups -- "$@"; }

refresh() {
  install -d -m 0755 "$LOWER"
  exec 8>"$LOWER/.refresh.lock"; flock 8
  refresh_locked
  exec 8>&-
}

refresh_locked() {
  local start gen tmp c
  RUID=$(cache_uid)
  start=$(date +%s); gen=$start; tmp=$LOWER/.new-$gen
  rm -rf "$LOWER"/.new-*
  install -d -m 0700 -o "$RUID" -g "$RUID" "$tmp"
  for c in $CACHES; do
    if [ -d "$TRUSTED/$c" ]; then
      # always, not auto: a full copy of 20 GB every hour must fail, not happen quietly.
      as_cache_user cp -a --reflink=always "$TRUSTED/$c" "$tmp/$c"
    else
      install -d -m 0755 -o "$RUID" -g "$RUID" "$tmp/$c"
    fi
  done
  # Everything that changed since SETTLE before the start may have been copied half-written:
  # drop it from the generation. A missing entry is a cache miss; a torn one is a wrong result.
  for c in $CACHES; do
    [ -d "$TRUSTED/$c" ] || continue
    (cd "$TRUSTED/$c" && as_cache_user find . -mindepth 1 ! -type d -newerct "@$((start - SETTLE))" -print0) \
      | as_cache_user bash -c "$DROP" drop "$(realpath "$tmp/$c")"
  done
  chown root:root "$tmp"; chmod 0755 "$tmp"
  (
    flock 9
    mv -T "$tmp" "$LOWER/$gen"
    ln -sfn "$gen" "$LOWER/.current.tmp" && mv -T "$LOWER/.current.tmp" "$LOWER/current"
    prune
  ) 9>"$LOWER/.lock"
  echo "fast-lower: generation $gen is current"
}

# Removes each NUL-separated path from the generation $1, but only if its folder resolves inside it.
# shellcheck disable=SC2016
DROP='root=$1
while IFS= read -r -d "" f; do
  d=$(realpath -e -- "$root/${f%/*}" 2>/dev/null) || continue
  case "$d/" in "$root/"*) rm -rf -- "$d/${f##*/}" ;; esac
done'

# Delete every generation that isn't current and that no overlay still mounts (called under the lock).
prune() {
  local cur d g
  cur=$(readlink "$LOWER/current" || true)
  for d in "$LOWER"/[0-9]*; do
    [ -d "$d" ] || continue
    g=${d##*/}
    [ "$g" = "$cur" ] && continue
    grep -qF "lowerdir=$LOWER/$g/" "$MOUNTS" && continue
    rm -rf "$d"
  done
}

current() {
  local cur
  cur=$(readlink "$LOWER/current" 2>/dev/null || true)
  if [ -z "$cur" ] || [ ! -d "$LOWER/$cur" ]; then
    install -d -m 0755 "$LOWER"
    exec 8>"$LOWER/.refresh.lock"; flock 8
    cur=$(readlink "$LOWER/current" 2>/dev/null || true)
    if [ -z "$cur" ] || [ ! -d "$LOWER/$cur" ]; then refresh_locked >&2; cur=$(readlink "$LOWER/current"); fi
    exec 8>&-
  fi
  [[ "$cur" =~ ^[0-9]+$ ]] || { echo "fast-lower: $LOWER/current is not a generation" >&2; exit 1; }
  echo "$LOWER/$cur"
}

timer() {
  local cur age
  if ! grep -q 'halonic-runner@fast-' "$SLOTS" 2>/dev/null; then
    echo "fast-lower: refresh skipped: no fast slot in $SLOTS"; return 0
  fi
  # 75 (EX_TEMPFAIL) means the lock was taken; any other failure is the copy's own, and fails the unit.
  if ( flock -n 9 || exit 75; refresh ) 9>"$MAINT_LOCK"; then :; else
    [ $? -eq 75 ] || return 1
    echo "fast-lower: refresh skipped: the weekly cleanup or the hourly cache check holds $MAINT_LOCK"
  fi
  cur=$(readlink "$LOWER/current" 2>/dev/null || true)
  [[ "$cur" =~ ^[0-9]+$ ]] || { echo "fast-lower: no current generation" >&2; return 1; }
  age=$(( $(date +%s) - cur ))
  if [ "$age" -gt "$MAX_AGE" ]; then
    echo "fast-lower: the current generation is ${age}s old (limit ${MAX_AGE}s): fast jobs read stale caches" >&2
    return 1
  fi
}

case "${1:-}" in
  refresh) refresh ;;
  current) current ;;
  timer) timer ;;
  *) echo "usage: $0 refresh|current|timer" >&2; exit 2 ;;
esac
