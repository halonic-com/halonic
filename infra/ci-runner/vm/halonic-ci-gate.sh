#!/bin/bash
# halonic-ci queue gate (C7, HAL-15355). Runs on the CI VM, never in a job container: systemd
# starts one copy per connection to /run/halonic-ci-gate/gate.sock (halonic-ci-gate.socket),
# with the socket as stdin and stdout. It answers one of two fixed queries, as plain HTTP:
# "GET /pr/<number>" gets that pull request's state, owner, head commit, labels and author (the fast
# pool, HAL-15972, HAL-17616); anything else gets main's merge queue. The number, 1-9 digits, is
# the only input that reaches a query; the rest of the request is read and dropped. The
# job-started hook in the container decides from the answer. With --pr-only (the fast slots' own
# socket, halonic-ci-gate-fast.socket) it answers pull request queries only and refuses anything
# else.
# The token (read-only, halonic-com/halonic only) reaches this script only as a systemd
# credential, and goes to curl through a config on a pipe, never on a command line.
set -euo pipefail
reply() { printf 'HTTP/1.0 %s\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n' "$1"; }
# The reason also goes in the answer (a fixed text, never the token), so the job's log shows it.
fail() { echo "halonic-ci-gate: $1" >&2; reply "502 Bad Gateway"; jq -nc --arg e "$1" '{error: $e}'; exit 0; }

# Read the request line, then drop the rest: at most 31 header lines, 5 s for the whole request,
# so a slow client can't hold a connection longer than that.
DEADLINE=$((SECONDS + 5))
IFS= read -r -t 5 first || first=""
first=${first%$'\r'}
PR=""; [[ "$first" =~ ^GET\ /pr/([1-9][0-9]{0,8})\ HTTP/1\.[01]$ ]] && PR=${BASH_REMATCH[1]}
if [ -n "$first" ]; then
  for _ in $(seq 31); do
    left=$((DEADLINE - SECONDS)); [ "$left" -gt 0 ] || break
    IFS= read -r -t "$left" line || break
    [ -n "${line%$'\r'}" ] || break
  done
fi
if [ "${1:-}" = --pr-only ] && [ -z "$PR" ]; then
  echo "halonic-ci-gate: not a pull request query on the pull-request-only socket" >&2
  reply "400 Bad Request"; exit 0
fi

TOKEN_FILE="${CREDENTIALS_DIRECTORY:-}/github-token"
[ -n "${CREDENTIALS_DIRECTORY:-}" ] && [ -s "$TOKEN_FILE" ] || fail "no github-token credential"
TOKEN=$(head -c 512 "$TOKEN_FILE" | tr -d '\r\n')
[[ "$TOKEN" =~ ^[A-Za-z0-9_]+$ ]] || fail "github-token credential is not a token"

if [ -n "$PR" ]; then
  QUERY="query { repository(owner: \"halonic-com\", name: \"halonic\") { pullRequest(number: $PR) { number state isCrossRepository headRefOid headRepositoryOwner { login } labels(first: 100) { nodes { name } } author { __typename login } } } }"
else
  QUERY='query { repository(owner: "halonic-com", name: "halonic") { mergeQueue(branch: "main") { entries(first: 100) { pageInfo { hasNextPage } nodes { position headCommit { oid } pullRequest { number isCrossRepository headRepositoryOwner { login } } } } } } }'
fi
BODY=$(curl -fsS --max-time 10 --max-filesize 1048576 --proto =https \
  --config <(printf 'header = "Authorization: bearer %s"\n' "$TOKEN") \
  -H "Content-Type: application/json" -H "User-Agent: halonic-ci-gate" \
  --data "$(jq -nc --arg q "$QUERY" '{query: $q}')" \
  https://api.github.com/graphql) || fail "GitHub API call failed"
unset TOKEN
jq -e . >/dev/null 2>&1 <<<"$BODY" || fail "GitHub API answer is not JSON"
reply "200 OK"
printf '%s\n' "$BODY"
