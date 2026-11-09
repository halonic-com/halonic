#!/usr/bin/env bash
# Decides whether a gitleaks run that scanned nothing proves anything.
#
# Inputs (environment):
#   LOG        the gitleaks log
#   STATUS     gitleaks' exit status
#   LOG_OPTS   the git log options given to gitleaks (empty means --all)
#   CONTAINER_GIT  command that runs git the way the container does, for
#              example `docker run ... --entrypoint git image`. Run with
#              `rev-list --count ...`.
#
# gitleaks skips some paths by default, pnpm-lock.yaml among them, so a
# commit that only touches those counts as "0 commits scanned". That is fine.
# "0 commits scanned" because git refused the repository (safe.directory) is
# not. They are told apart by asking git in the container to count the range:
# if it counts the same commits as git on the host, git worked and gitleaks
# skipped every file. If it fails or disagrees, the scan proves nothing.
set -u

scanned=$(grep -oE '[0-9]+ commits scanned' "$LOG" | grep -oE '^[0-9]+' || true)
if [[ "$scanned" =~ ^[1-9][0-9]*$ ]]; then
  exit "$STATUS"
fi

range=(${LOG_OPTS:---all})
expected=$(git rev-list --count "${range[@]}" 2>/dev/null || true)
inside=$($CONTAINER_GIT rev-list --count "${range[@]}" 2>/dev/null || true)

if [[ "$expected" =~ ^[1-9][0-9]*$ && "$inside" == "$expected" ]]; then
  echo "::notice title=gitleaks::The range has $expected commit(s), but gitleaks skipped every file they changed (for example only pnpm-lock.yaml). Nothing to scan."
  exit "$STATUS"
fi

echo "::error title=gitleaks::No commits were scanned, so the scan proves nothing (range has '${expected}' commits on the runner, '${inside}' in the container). See the log above."
exit 1
