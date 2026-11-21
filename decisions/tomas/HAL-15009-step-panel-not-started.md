# Decision: the step panel shows an approved call that wasn't made and a connector that didn't start

- Approval: Liam approves this note in his review of this pull request on HAL-15009
- Kind: user-visible
- Task: HAL-15009

## What changes

`runs.run-view.step-failed-call` said, under "Limits", that two cases the engine now logs with a
`connector-not-started` cause have no row in the step panel, so the panel showed nothing for them:

1. A call a person approved whose connector then didn't start (HAL-13829, #4293). It has an
   `approval.requested`, an `approval.resolved` and a `tool.result` with the cause, but no
   `tool.called`. The panel now lists it as a tool call from its `approval.requested` (tool,
   arguments, connector) with the same "Didn't work: the connector *mail* didn't start: …" line.
   The "Limits" paragraph now names only the case below and points to its requirement.
2. A connector that couldn't list its tools when a turn started (`connector.listing-failed`,
   #4009). No call was made. The new requirement `runs.run-view.step-connector-not-started` gives
   it one quiet ✕ line at the top of the step's Tool calls, once per connector. It's left out when
   an approved call's line already says that connector didn't start, so the panel doesn't say it
   twice.

## Why

So a step whose connector didn't start no longer reads as if nothing went wrong. The person sees
which connector it was and which program or secret it missed, and can act on it.

- The approved call's line is the `connector-not-started` line already in
  `runs.run-view.step-failed-call` (HAL-12471, decided by the team on HAL-13829).
- The connector's line uses the `halonic tools review` lines the team decided on HAL-13829
  (`cli.commands.tools.connector-start`), in the quiet ✕ line the panel already draws (HAL-12415
  option a). It adds no new screen or control. Sofia agreed on HAL-15021 that it is small
  wording on the approved panel: the three lines as decided, no "so its tools were off" clause and
  no fix line, the listing lines before the calls, and the step's ✓ stays as it is.
- The result is matched to the approved call of the same tool, by the state's agent or its
  subagent, that has neither a `tool.called` nor a result yet. The `tool.result` carries no call
  id, and in the engine's log it comes right after the turn lists its tools again, inside the same
  step.

## Tests

No test was weakened or removed. Two assertions in `step-events-model.test.ts` that compare the
whole result now include the new, empty `connectorsNotStarted`. `step-failed-call.test.tsx` gains
the approved call that wasn't made, the approved call that was made (listed once) and a rejected
call (not listed). The new `step-connector-not-started.test.tsx` covers each cause, a cause it
can't read, one line per connector over several turns, the line left out under an approved call,
the Tool calls heading without a tool call, and escaped names.

## Covers

- runs.run-view.step-failed-call
