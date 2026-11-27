# studio.served-wait-context

- Status: active
- Since: unreleased
- Source: HAL-19450 (Sofia found G3 in the served Studio, HAL-19383; Julian's review of HAL-19395); `inbox.wait-context`, `server.waiting-run-context`

The served Studio (`halonic serve`, in a desktop or phone browser) shall show a run waiting at a `wait` step as the desktop app does under `inbox.wait-context`, from what `GET /api/waiting-runs` says about the run in its `context`: the meta line with the workflow's name and " · Sample answers" when the test model wrote the run's answers, on the card and at the start of the Inbox and Needs you rows; the run's start input as a quote above the draft; the draft in its own box; and the step's closing words as a caption by the answers, never inside the draft's box, before or after an answer. It shall keep a run's context after the run leaves the list, so the answered card still shows it. It shall show no **Open run** and no "Started by" line, since the served Studio has no run page. A `context` that is missing or can't be read, or an entry for a run that can't be read, shall never fail the list: that run's card reads as without a description (`inbox.wait-context`).

## Examples

- Given Acme's run of Support reply on the test model, waiting at `review`, with its `context` in the list,
  when you open its item in the served Studio on a desktop or a phone,
  then the line above "Approve this reply?" reads "Support reply · Sample answers", the customer's email shows as a quote above the draft, and "Approving finishes the run. Nothing is sent." shows outside the draft's box.
- Given that card,
  when you press **Approve** and the run leaves the list,
  then the meta line and the quote still show, and the draft's box still doesn't hold "Approving finishes the run. Nothing is sent.".
- Given a host whose list has no `context`,
  then the card shows its body as plain text, as before.
