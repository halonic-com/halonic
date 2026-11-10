#!/usr/bin/env bash
# WSL2 release check (HAL-3646): two things the automated suites can't test.
#
#   1. A private file on a Windows drive (/mnt/c, drvfs) can't be read inside srt.
#   2. Windows programs started from WSL ("interop": cmd.exe, curl.exe) can't
#      read that file or reach a blocked site from inside srt.
#
# Run it on a real Windows machine, in a WSL2 distro, with srt installed
# (`srt --version` works) and the harness's own sandbox off. Every probe also
# runs once outside srt as a control: a probe whose control fails is
# INCONCLUSIVE, never a pass. Exit 0 = all pass, 1 = a fence leaked, 2 = inconclusive.
# It writes only a marker file and a settings file in a temp folder it removes.
set -u

SRT=${SRT:-srt}
BLOCKED_URL=${BLOCKED_URL:-https://example.org/}
ALLOWED_HOST=${ALLOWED_HOST:-example.com}
WIN_DRIVE=${WIN_DRIVE:-/mnt/c}
WIN_TEMP=${WIN_TEMP:-$WIN_DRIVE/Users/Public}

leaks=0 inconclusive=0
say() { printf '%s\n' "$*"; }
result() { say "$1: $2"; }

command -v "$SRT" > /dev/null || { say "srt not found (set SRT=...)"; exit 2; }
[ -d "$WIN_TEMP" ] || { say "$WIN_TEMP is not a Windows folder; set WIN_TEMP"; exit 2; }
grep -qi microsoft /proc/version || { say "not WSL"; exit 2; }
say "WSL: $(uname -r)"
say "srt: $("$SRT" --version 2>&1 | head -1)"
say "interop enabled: $([ -e /proc/sys/fs/binfmt_misc/WSLInterop ] || [ -e /proc/sys/fs/binfmt_misc/WSLInterop-late ] && echo yes || echo no)"
say "drvfs mount: $(findmnt -no FSTYPE,OPTIONS -T "$WIN_TEMP" | cut -c1-120)"

work=$(mktemp -d "$WIN_TEMP/halonic-wsl2-check.XXXXXX") || exit 2
trap 'rm -rf "$work"' EXIT
secret="$work/private.txt"
marker="HALONIC-WSL2-MARKER-$$-$RANDOM"
printf '%s\n' "$marker" > "$secret"
winsecret=$(wslpath -w "$secret")

settings="$work/settings.json"
cat > "$settings" <<JSON
{
  "network": { "allowedDomains": ["$ALLOWED_HOST"], "deniedDomains": [] },
  "filesystem": {
    "denyRead": [{ "path": "$secret", "literal": true }],
    "allowWrite": [],
    "denyWrite": [{ "path": "$secret", "literal": true }]
  }
}
JSON
# The folder stays readable except the one file, as a real profile would have it.
# (Settings and marker live in $work, which is why only the marker is denied.)
fenced() { "$SRT" --settings "$settings" "$@"; }

# probe <name> <what a leak looks like> <command...>
# Control (no srt) must show the leak; the fenced run must not.
probe() {
  local name=$1 needle=$2; shift 2
  local control fenced_out
  control=$("$@" 2>&1); 
  if ! grep -q -- "$needle" <<< "$control"; then
    result "$name" "INCONCLUSIVE (the control run did not show the marker or the site; output: $(head -c 120 <<< "$control"))"
    inconclusive=1; return
  fi
  fenced_out=$(fenced "$@" 2>&1)
  if grep -q -- "$needle" <<< "$fenced_out"; then
    result "$name" "FAIL, leaked inside srt"; leaks=1
  else
    result "$name" "PASS (inside srt: $(head -c 100 <<< "$fenced_out" | tr '\n' ' '))"
  fi
}

say; say "== 1. private file on /mnt/c =="
probe "1a cat from WSL" "$marker" cat "$secret"

say; say "== 2. Windows programs through interop =="
if ! command -v cmd.exe > /dev/null; then
  result "2 interop" "SKIPPED, cmd.exe is not on the PATH (interop off); the start-up check needs no change"
else
  probe "2a cmd.exe type" "$marker" cmd.exe /c type "$winsecret"
  probe "2b powershell Get-Content" "$marker" powershell.exe -NoProfile -Command "Get-Content -LiteralPath '$winsecret'"
  # A blocked site: the control must answer with its page (it says "Example Domain").
  if command -v curl.exe > /dev/null; then
    probe "2c curl.exe blocked site" "Example Domain" curl.exe -sS -m 15 "$BLOCKED_URL"
  fi
  # Can a Windows program start at all inside srt? Informational: if it can, 2a-2c decide.
  if fenced cmd.exe /c ver > /dev/null 2>&1; then
    result "2d interop reachable inside srt" "YES (the start-up check must require interop off unless 2a to 2c passed)"
  else
    result "2d interop reachable inside srt" "NO"
  fi
fi

say
if [ "$leaks" = 1 ]; then say "RESULT: FAIL. A fence leaked; release is blocked."; exit 1; fi
if [ "$inconclusive" = 1 ]; then say "RESULT: INCONCLUSIVE. Fix the control and run again."; exit 2; fi
say "RESULT: PASS"
