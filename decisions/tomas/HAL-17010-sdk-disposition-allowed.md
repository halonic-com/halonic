# Decision: allow the plugin SDK patch for issues.setDisposition

- Approval: HAL-16988 (Liam's decision B, condition 6), HAL-17010. Julian signs this note: it lets a plugin call a new write capability (HAL-15971 point 6).
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:8h9xcq+FAgZ2rSCngQGc7AkfwyxDaBEuoccn0Mm/aLBsE3jSFN/shBGa2SKBF3F4VODClaPkySTs9QsMblNZCw==

## What changes

- `tooling/check/patches-allowed.json`: the entry for
  `patches/@paperclipai__plugin-sdk@2026.1117.0.patch` gets a `next-sha256`, the hash of the
  extended patch, next to the `sha256` of the patch in use, and a reason and `remove-when` that
  cover both calls. The extended patch comes in the next pull request, which moves the new hash to
  `sha256` and drops `next-sha256` (`docs/guides/dependencies.md`).
- The extended patch keeps `ctx.issues.monitors.postpone` as it is and adds one method,
  `ctx.issues.setDisposition(issueId, companyId, patch)`, to the SDK's plugin worker
  (`dist/worker-rpc-host.js`), with its types in `dist/types.d.ts`. `patch` takes only `status`,
  `assigneeAgentId`, `assigneeUserId`, `blockedByIssueIds`, `comment` and `monitor`. The method
  only calls the host method `issues.setDisposition` from our local Paperclip server patch
  (halonic-com/server#31, HAL-16989) and returns its result `{ ok, status, body }` unchanged.

## Why

The Agent tools plugin's `set_next_step` and `finish_run` tools (HAL-16403) let an agent leave its
task in a valid state in one call. A plugin's `ctx.issues.update` writes the task directly: it skips
the disposition guard, wakes nobody on a reassign, doesn't stop the old run and can't set a monitor.
Only `PATCH /api/issues/:id` does all of that, so decision B gives plugins a host method that goes
through that route. The SDK's `callHost` is private, so the plugin can't reach the host method
without this patch. The SDK is a dev dependency, bundled into the plugin's `worker.js`; nothing in
Halonic's packages loads it.

The server decides everything; the SDK side adds no rule of its own:

- The plugin needs the capability `issues.disposition.write`, which only the Agent tools plugin is
  granted.
- The actor is the agent and run whose tool call is in flight, taken from the server's own tool-call
  scope, never from the plugin's arguments. The run goes into that scope only when the tool call
  was made with that agent's own key for that run; board-started and cross-run calls are refused.
- The call is refused unless that run is the live run holding the task.
- The route answers as it does for the agent's own request: `in_review` for an agent reviewer is
  refused with `invalid_issue_disposition`, monitors keep their bounds, and `monitorNextCheckAt`
  comes back in the task.
- A reassign to another agent stops the calling run, so `finish_run` must be a run's last call and
  `set_next_step` refuses a reassign (HAL-16403).

## Decided deviation from condition 1

Condition 1 asked to move the route's update logic into a shared service function called by both
the route and the host method. The server patch instead sends the update through the server's own
`/api` router in process, with the real agent authentication in front, the way Paperclip's public
MCP server does (`createMcpApiDispatch`). The route's code is neither moved nor copied, so it is one
code path by construction, and the diff stays small enough to rebase on upstream. Liam accepted
this in his review of halonic-com/server#31 (HAL-16989).

## Covers

- tooling/check/
