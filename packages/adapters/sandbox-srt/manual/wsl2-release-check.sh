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
interop=no
{ [ -e /proc/sys/fs/binfmt_misc/WSLInterop ] || [ -e /proc/sys/fs/binfmt_misc/WSLInterop-late ]; } && interop=yes
say "interop enabled: $interop"
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
# "--" ends srt's own options, so the program's flags (curl's -sS) are not read as srt's.
fenced() { "$SRT" --settings "$settings" -- "$@"; }

# probe <name> <what a leak looks like> <command...>
# Control (no srt) must show the leak; the fenced run must not.
probe() {
  local name=$1 needle=$2; shift 2
  local control fenced_out
  control=$("$@" 2>&1)
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
# With appendWindowsPath=false interop stays on but the programs are not on the PATH,
# so look in System32 too.
SYS32=$WIN_DRIVE/Windows/System32
find_win() { # find_win <exe> <path inside System32>
  if command -v "$1" > /dev/null; then command -v "$1"; elif [ -x "$SYS32/$2" ]; then printf '%s\n' "$SYS32/$2"; fi
}
CMD=$(find_win cmd.exe cmd.exe)
PWSH=$(find_win powershell.exe WindowsPowerShell/v1.0/powershell.exe)
CURL=$(find_win curl.exe curl.exe)
missing() { result "$1" "INCONCLUSIVE ($2 not found although interop is on; set WIN_DRIVE or fix the PATH)"; inconclusive=1; }

if [ "$interop" = no ]; then
  result "2 interop" "SKIPPED, interop is off; the start-up check needs no change"
else
  if [ -n "$CMD" ]; then probe "2a cmd.exe type" "$marker" "$CMD" /c type "$winsecret"; else missing "2a cmd.exe type" cmd.exe; fi
  if [ -n "$PWSH" ]; then
    probe "2b powershell Get-Content" "$marker" "$PWSH" -NoProfile -Command "Get-Content -LiteralPath '$winsecret'"
  else missing "2b powershell Get-Content" powershell.exe; fi
  # A blocked site: the control must answer with its page (it says "Example Domain").
  if [ -n "$CURL" ]; then probe "2c curl.exe blocked site" "Example Domain" "$CURL" -sS -m 15 "$BLOCKED_URL"; else missing "2c curl.exe blocked site" curl.exe; fi
  # Can a Windows program start at all inside srt? Informational: if it can, 2a-2c decide.
  if [ -n "$CMD" ]; then
    if fenced "$CMD" /c ver > /dev/null 2>&1; then
      result "2d interop reachable inside srt" "YES (the start-up check must require interop off unless 2a to 2c passed)"
    else
      result "2d interop reachable inside srt" "NO"
    fi
  fi
fi

say
if [ "$leaks" = 1 ]; then say "RESULT: FAIL. A fence leaked; release is blocked."; exit 1; fi
if [ "$inconclusive" = 1 ]; then say "RESULT: INCONCLUSIVE. Fix the control and run again."; exit 2; fi
say "RESULT: PASS"
