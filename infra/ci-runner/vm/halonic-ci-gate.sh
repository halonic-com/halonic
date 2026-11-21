#!/bin/bash
# halonic-ci queue gate (C7, HAL-15355). Runs on the CI VM, never in a job container: systemd
# starts one copy per connection to /run/halonic-ci-gate/gate.sock (halonic-ci-gate.socket),
# with the socket as stdin and stdout. It takes no input: whatever the client sends is read and
# dropped, and the answer is always the same fixed query, main's merge queue, as plain HTTP.
# The job-started hook in the container decides from that answer.
# The token (read-only, halonic-com/halonic only) reaches this script only as a systemd
# credential, and goes to curl through a config on a pipe, never on a command line.
set -euo pipefail
reply() { printf 'HTTP/1.0 %s\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n' "$1"; }
fail() { echo "halonic-ci-gate: $1" >&2; reply "502 Bad Gateway"; exit 0; }

# Drop the request: at most 32 header lines, 5 s.
for _ in $(seq 32); do
  IFS= read -r -t 5 line || break
  [ -n "${line%$'\r'}" ] || break
done

TOKEN_FILE="${CREDENTIALS_DIRECTORY:-}/github-token"
[ -n "${CREDENTIALS_DIRECTORY:-}" ] && [ -s "$TOKEN_FILE" ] || fail "no github-token credential"
TOKEN=$(head -c 512 "$TOKEN_FILE" | tr -d '\r\n')
[[ "$TOKEN" =~ ^[A-Za-z0-9_]+$ ]] || fail "github-token credential is not a token"

QUERY='query { repository(owner: "halonic-com", name: "halonic") { mergeQueue(branch: "main") { entries(first: 100) { pageInfo { hasNextPage } nodes { position headCommit { oid } pullRequest { number isCrossRepository headRepositoryOwner { login } } } } } } }'
BODY=$(curl -fsS --max-time 10 --max-filesize 1048576 --proto =https \
  --config <(printf 'header = "Authorization: bearer %s"\n' "$TOKEN") \
  -H "Content-Type: application/json" -H "User-Agent: halonic-ci-gate" \
  --data "$(jq -nc --arg q "$QUERY" '{query: $q}')" \
  https://api.github.com/graphql) || fail "GitHub API call failed"
unset TOKEN
jq -e . >/dev/null 2>&1 <<<"$BODY" || fail "GitHub API answer is not JSON"
reply "200 OK"
printf '%s\n' "$BODY"
