#!/bin/bash
# halonic-ci job-started hook. Baked into the runner image (root-owned, read-only), so a
# pull request can't change it. Runs before the job's first step; a non-zero exit fails the
# job. This is the real boundary (HAL-14831, Julian's C1/C2): it trusts only the root-owned
# pool config (mounted read-only), the event file the runner wrote and the VM's gate, and fails
# closed. Pull requests run only on the fast pool, and only fast-track ones from our own branches
# (HAL-15972).
set -euo pipefail
deny() { echo "::error title=halonic-ci refused this job::$1. These runners only take halonic-com/halonic's own reviewed runs (ci.yml on merge groups / pushes to main) and, on the fast pool, open pull requests from halonic-com/halonic branches labelled fast-track."; exit 1; }
REPO=halonic-com/halonic
CONF=/etc/halonic-ci/pool.conf
EVENT_FILE=/home/runner/actions-runner/_work/_temp/_github_workflow/event.json  # leak-guard: allow absolute-path written by the runner inside the image
GATE=/run/halonic-ci-gate/gate.sock  # the VM's queue gate (C7), mounted read-only; it holds the token, we never see it
MOUNTS=/proc/self/mountinfo

command -v jq >/dev/null 2>&1 || deny "jq missing in image"
[ -r "$CONF" ] || deny "pool config missing"
[ ! -w "$CONF" ] || deny "pool config is writable"
conf() { sed -n "s/^$1=\(.*\)$/\1/p" "$CONF" | tail -1 | tr -d '"'; }
ALLOWED_EVENTS=" $(conf ALLOWED_EVENTS) "
SMOKE_BRANCH=$(conf SMOKE_BRANCH)
SMOKE_WORKFLOW=$(conf SMOKE_WORKFLOW)
POOL=$(conf POOL)

[ "${GITHUB_EVENT_PATH:-}" = "$EVENT_FILE" ] || deny "unexpected event path"
[ -s "$EVENT_FILE" ] || deny "event file missing"
ev() { jq -r "$1 // empty" "$EVENT_FILE"; }

[ "$(ev .repository.full_name)" = "$REPO" ] || deny "repository $(ev .repository.full_name)"
[ "${GITHUB_REPOSITORY:-}" = "$REPO" ] || deny "repository ${GITHUB_REPOSITORY:-unset}"
[ "$(ev .repository.fork)" != "true" ] || deny "fork repository"

if   jq -e 'has("merge_group")'  "$EVENT_FILE" >/dev/null; then kind=merge_group
elif jq -e 'has("pull_request")' "$EVENT_FILE" >/dev/null; then kind=pull_request
elif jq -e 'has("pusher") and has("ref")' "$EVENT_FILE" >/dev/null; then kind=push
else deny "event type not allowed"; fi
[ "$kind" = "${GITHUB_EVENT_NAME:-}" ] || deny "event name ${GITHUB_EVENT_NAME:-unset} does not match the event ($kind)"

case "$ALLOWED_EVENTS" in *" $kind "*) ;; *) deny "event $kind is off on this pool" ;; esac
WF="${GITHUB_WORKFLOW_REF:-}"
# The VM's gate answers one of two fixed queries: main's merge queue, or one pull request.
gate_ready() { command -v curl >/dev/null 2>&1 || deny "curl missing in image"; [ -S "$GATE" ] || deny "queue gate not available"; }
gate() { curl -fsS --max-time 15 --max-filesize 1048576 --unix-socket "$GATE" "http://halonic-ci-gate/$1"; }
# A shared cache mounted here must be read-only or an overlay (the fast slot's per-job upper layer
# over the read-only shared folder), never the shared folder itself (C2/C8). Under gVisor, which
# fast slots run in, every mount shows as its file proxy's ("9p"); there the slot script checks the
# overlay on the VM before the container starts, so the hook accepts 9p on the fast pool only.
cache_safe() {
  awk -v m="$1" -v fast="$([ "$POOL" = fast ] && echo 1)" '$5 == m { split($0, p, " - "); split(p[2], f, " ")
      if (f[1] == "overlay" || $6 ~ /^ro(,|$)/ || (fast && f[1] == "9p")) ok = 1; else bad = 1 }
    END { exit !(ok && !bad) }' "$MOUNTS"
}
case "$kind" in
  pull_request)
    from=$(ev .pull_request.head.repo.full_name)
    [ "$POOL" = fast ] || deny "pull request from $from on a pool that takes no pull requests"
    [ "$from" = "$REPO" ] || deny "pull request from $from"
    [ "$(ev .pull_request.base.repo.full_name)" = "$REPO" ] || deny "pull request into $(ev .pull_request.base.repo.full_name)"
    pr=$(ev .pull_request.number); head_sha=$(ev .pull_request.head.sha)
    [[ "$pr" =~ ^[1-9][0-9]{0,8}$ ]] || deny "pull request number $pr"
    [[ "$head_sha" =~ ^[0-9a-f]{40}$ ]] || deny "pull request commit $head_sha"
    [ "$WF" = "$REPO/.github/workflows/ci.yml@refs/pull/$pr/merge" ] || deny "workflow $WF"
    for c in /cache/pnpm-store /cache/turbo /cache/ms-playwright; do
      cache_safe "$c" || deny "shared cache $c is not read-only here"
    done
    # The event is what GitHub sent when the run started; the gate says what's true now.
    gate_ready
    answer=$(gate "pr/$pr") || deny "queue gate did not answer"
    verdict=$(jq -r --argjson pr "$pr" --arg sha "$head_sha" '
      if (.errors // []) != [] then "GitHub API errors"
      else .data.repository.pullRequest as $p
        | if $p == null then "pull request #\($pr) not found"
          elif $p.number != $pr then "the gate answered for another pull request"
          elif $p.state != "OPEN" then "pull request #\($pr) is not open"
          elif $p.isCrossRepository != false or $p.headRepositoryOwner.login != "halonic-com"
            then "pull request #\($pr) comes from outside halonic-com"
          elif $p.headRefOid != $sha then "pull request #\($pr) is no longer at \($sha)"
          elif ([$p.labels.nodes[]?.name] | any(. == "fast-track")) | not
            then "pull request #\($pr) has no fast-track label"
          else "ok" end
      end' <<<"$answer" 2>/dev/null) || deny "queue gate answer unreadable"
    [ "$verdict" = ok ] || deny "$verdict" ;;
  merge_group)
    [ "$(ev .merge_group.base_ref)" = "refs/heads/main" ] || deny "merge group not for main"
    head_ref=$(ev .merge_group.head_ref); head_sha=$(ev .merge_group.head_sha)
    [[ "$head_ref" =~ ^refs/heads/gh-readonly-queue/main/pr-([0-9]{1,9})-[0-9a-f]{40}$ ]] || deny "merge group ref $head_ref"
    pr=${BASH_REMATCH[1]}
    [[ "$head_sha" =~ ^[0-9a-f]{40}$ ]] || deny "merge group commit $head_sha"
    [ "$WF" = "$REPO/.github/workflows/ci.yml@$head_ref" ] || deny "workflow $WF"
    # C7: the group's commit holds the code of its own pull request and of every entry ahead of
    # it, so each of those must come from a halonic-com/halonic branch, not a fork.
    gate_ready
    queue=$(gate queue) || deny "queue gate did not answer"
    verdict=$(jq -r --argjson pr "$pr" --arg sha "$head_sha" '
      if (.errors // []) != [] then "GitHub API errors"
      elif .data.repository.mergeQueue == null then "no merge queue for main"
      else .data.repository.mergeQueue.entries as $e
        | [$e.nodes[] | select(.pullRequest.number == $pr and .headCommit.oid == $sha)] as $hit
        | if ($hit | length) != 1 then
            (if $e.pageInfo.hasNextPage then "pull request #\($pr) not in the first 100 queue entries"
             else "pull request #\($pr) at \($sha) not in the merge queue" end)
          else [$e.nodes[] | select(.position <= $hit[0].position)
                | select(.pullRequest.isCrossRepository != false
                         or .pullRequest.headRepositoryOwner.login != "halonic-com")
                | .pullRequest.number] as $bad
            | if $bad != [] then "merge group holds a pull request from outside halonic-com: #\($bad | map(tostring) | join(", #"))"
              else "ok" end
          end
      end' <<<"$queue" 2>/dev/null) || deny "queue gate answer unreadable"
    [ "$verdict" = ok ] || deny "$verdict" ;;
  push)
    ref=$(ev .ref)
    if [ "$ref" = "refs/heads/main" ]; then
      [ "$WF" = "$REPO/.github/workflows/ci.yml@refs/heads/main" ] || deny "workflow $WF"
    elif [ -n "$SMOKE_BRANCH" ] && [ -n "$SMOKE_WORKFLOW" ] && [ "$ref" = "refs/heads/$SMOKE_BRANCH" ]; then
      [ "$WF" = "$REPO/.github/workflows/$SMOKE_WORKFLOW@refs/heads/$SMOKE_BRANCH" ] || deny "workflow $WF"
    else
      deny "push to $ref"
    fi ;;
esac
echo "halonic-ci: accepted $kind for $WF"
