# paperclip.line-agents

- Status: active
- Since: unreleased
- Source: the board's request to talk to any agent, not only Chief, on the same kind of line, with the same reply signal

While the chief line is on, when a signed-in board user calls `POST /chief-line/thread`, `POST /chief-line/send`, `GET /chief-line/thread` or `POST /chief-line/subscribe` with an `agent` (an agent's id, url key or name, case not mattering) that is not Chief, the plugin shall use, under the same rules as the chief line, the live thread titled `[line] <caller> → <agent's name>` in `chiefLine.projectId`, creating it assigned to that agent, post sends there as the plugin and wake that agent, and keep that line's webhook; an unknown agent is answered 404. Without an `agent`, or with Chief, the plugin shall behave exactly as the chief line (`[chief-line] <caller>`). When the thread's agent comments on such a thread, the plugin shall POST `{thread, caller, commentId, at, agent}` (the agent's name; `Chief` on a chief line) to the line's webhook, or, when the line has none, the caller's chief line webhook; a human's comment there wakes the thread's agent, and another agent's comment signals nothing.

## Examples

- Given caller `sup`,
  when it opens a thread with agent `ravi` and then with agent `Ravi`,
  then one task `[line] sup → Ravi`, assigned to Ravi, exists beside `[chief-line] sup`.
- Given `sup`'s line to Ravi with a webhook,
  when Ravi comments there,
  then the webhook gets `{thread, caller: "sup", commentId, at, agent: "Ravi"}`; Chief's comment there sends nothing.
