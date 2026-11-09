# events.summary-approvals-and-signals

- Status: active
- Since: 0.1.0
- Source: old app `summarize` at commit 784f78d

When a run asks for an approval, its summary shall list the waiting tool call, with the time it was asked, its state, and its parallel branch and for-each item (`null` when it has none), until an `approval.resolved` with the same call id removes it. Approvals from several branches of one run are listed together, oldest first. When a run sends signals, its summary shall list them in order, each with the id "<runId>:<seq>".

## Examples

- Given `approval.requested` for tool "send" with call id "c1",
  when it is summarized,
  then the approvals list one entry: agent, tool "send", its arguments, call id "c1", its time and state, branch `null` and item `null`.
- Given `approval.requested` followed by `approval.resolved`,
  when they are summarized,
  then the approvals list is empty.
- Given `approval.requested` with call ids "c1" in branch "left", "c2" in branch "right" and "c3" in item 1, then `approval.resolved` for "c2",
  when they are summarized,
  then the approvals list "c1" and "c3", in that order.
- Given `approval.resolved` with a call id that isn't waiting,
  when it is summarized,
  then the approvals list stays as it was.
- Given `signal.sent` "done" as event 4 of run "r",
  when it is summarized,
  then the signals list `{ id: "r:4", name: "done", data, at }`.
