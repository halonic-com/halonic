# events.summary-approvals-and-signals

- Status: active
- Since: 0.1.0
- Source: old app `summarize` at commit 784f78d

When a run asks for an approval, its summary shall show the waiting tool call until the approval is resolved. When a run sends signals, its summary shall list them in order, each with the id "<runId>:<seq>".

## Examples

- Given `approval.requested` for tool "send" with call id "c1",
  when it is summarized,
  then the approval is agent, tool "send", its arguments and call id "c1".
- Given `approval.requested` followed by `approval.resolved`,
  when they are summarized,
  then the approval is `null`.
- Given `signal.sent` "done" as event 4 of run "r",
  when it is summarized,
  then the signals list `{ id: "r:4", name: "done", data, at }`.
