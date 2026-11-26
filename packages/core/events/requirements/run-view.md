# events.run-view

- Status: active
- Since: unreleased
- Source: architecture design 16.4 (HAL-12483); plan on HAL-20108, approved on HAL-20110

When a deployment shows a run to an end user, it shall build the run view from the run's events with `toRunView` and `toRunViewEvents`, which keep only an allow list of event kinds and fields: the run's id, the exposed workflow's display name, status, start and end times, a title from the end user's first message, the end user's messages and the final text answers of the steps marked user-facing, the context values and files declared as results, the approvals and questions waiting for the end user, what the run waits for, token use and cost, and a failure as a closed cause. Every event kind shall be named in the filter's table as shown or hidden, so a new kind doesn't typecheck until it is decided; at run time an event kind the table doesn't know shall be left out. The view shall never hold prompts or instructions, model, tool, sandbox or harness setup, tool calls with their arguments and results, states, transitions, signals, timers, child runs, the run's context outside its results, `definitionsVersion`, `hubId`, `workflowId`, knowledge searches, or a failure's error text.

Each waiting approval or question shall carry an answer handle the deployment gives for it, with its kind and payload schema (`approve-or-reject`, `choice` or `message`), never an event name, a call id or a state; `waitingPointsOf` shall list those points first, so the deployment can make and store their handles before it builds the view. An approval shall show only the seller's approval text, with its `{name}` placeholders filled from plain arguments, or a fixed line when there is none. A question's choices shall be only the wait step's answers that have a label. A failure shall be one of `stopped`, `limit` (with the plan's stop code, or `budget`), `connection` (with the connection's name), `unavailable` or `other`, read from the typed reason and cause only, and shown with a fixed sentence.

## Examples

- Given a run with one event of every kind, each hidden field holding a marker,
  when it is turned into a run view and its view events,
  then neither holds the marker, and they hold the display name, the first message, the user-facing answer, the declared result and file.
- Given an event of a kind the filter doesn't know,
  when the view events are built,
  then it is left out.
- Given a run waiting for approval of `github/push` with the seller text "Push branch {branch} to {repo}",
  when the view is built,
  then it asks "Push branch fix-login to acme/shop" with an `approve-or-reject` handle and no tool, connector or arguments.
- Given a wait step accepting "ok" (labelled "Looks right"), "redo" (no label) and the chat message event,
  when the view is built,
  then it asks one question with the single choice "Looks right", and offers a `message` handle.
- Given a run that failed with a provider's error text and a typed cause `denied` with code `google.api-disabled`,
  when the view is built,
  then the failure is `connection` "google" and the error text is nowhere in the view.
