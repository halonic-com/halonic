#!/bin/bash
# halonic-ci job-started hook. Baked into the runner image (root-owned, read-only), so a
# pull request can't change it. Runs before the job's first step; a non-zero exit fails the
# job. This is the real boundary (HAL-14831, Julian's C1/C2): it trusts only the root-owned
# pool config (mounted read-only) and the event file the runner wrote, and fails closed.
set -euo pipefail
deny() { echo "::error title=halonic-ci refused this job::$1. These runners only take halonic-com/halonic's own reviewed runs (ci.yml on merge groups / pushes to main). Pull requests never run here."; exit 1; }
REPO=halonic-com/halonic
CONF=/etc/halonic-ci/pool.conf
EVENT_FILE=/home/runner/actions-runner/_work/_temp/_github_workflow/event.json  # leak-guard: allow absolute-path written by the runner inside the image
GATE=/run/halonic-ci-gate/gate.sock  # the VM's queue gate (C7), mounted read-only; it holds the token, we never see it

command -v jq >/dev/null 2>&1 || deny "jq missing in image"
[ -r "$CONF" ] || deny "pool config missing"
[ ! -w "$CONF" ] || deny "pool config is writable"
conf() { sed -n "s/^$1=\(.*\)$/\1/p" "$CONF" | tail -1 | tr -d '"'; }
ALLOWED_EVENTS=" $(conf ALLOWED_EVENTS) "
SMOKE_BRANCH=$(conf SMOKE_BRANCH)
SMOKE_WORKFLOW=$(conf SMOKE_WORKFLOW)

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
case "$kind" in
  pull_request)
    deny "pull request from $(ev .pull_request.head.repo.full_name)" ;;
  merge_group)
    [ "$(ev .merge_group.base_ref)" = "refs/heads/main" ] || deny "merge group not for main"
    head_ref=$(ev .merge_group.head_ref); head_sha=$(ev .merge_group.head_sha)
    [[ "$head_ref" =~ ^refs/heads/gh-readonly-queue/main/pr-([0-9]{1,9})-[0-9a-f]{40}$ ]] || deny "merge group ref $head_ref"
    pr=${BASH_REMATCH[1]}
    [[ "$head_sha" =~ ^[0-9a-f]{40}$ ]] || deny "merge group commit $head_sha"
    [ "$WF" = "$REPO/.github/workflows/ci.yml@$head_ref" ] || deny "workflow $WF"
    # C7: the group's commit holds the code of its own pull request and of every entry ahead of
    # it, so each of those must come from a halonic-com/halonic branch, not a fork.
    command -v curl >/dev/null 2>&1 || deny "curl missing in image"
    [ -S "$GATE" ] || deny "queue gate not available"
    queue=$(curl -fsS --max-time 15 --max-filesize 1048576 --unix-socket "$GATE" http://halonic-ci-gate/queue) \
      || deny "queue gate did not answer"
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
