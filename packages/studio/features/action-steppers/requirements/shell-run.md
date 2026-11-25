# action-steppers.shell-run

- Status: draft
- Since: unreleased
- Source: HAL-17535 (approvals stream HAL-17488, PR 9b); plan approved on HAL-18163; architecture note on HAL-17491, sections 1.3, 2.4, 6.3, 7.3 and 7.4

In the desktop app, the stepper shall check an opened action request again, read its record and the user's sign-in, and show each step as the record has it, so a request opened again resumes at the next step. It shall ask the user to sign in before any step runs. When the user runs a step, the stepper shall check the request again and send exactly that reviewed step, its values sorted into the route's placeholders and body, through the action steps app service, which records it. A step the user did on the page a guided step opened, or by hand, shall be recorded as done when the user says so. When every step is done, or the user declines, the stepper shall answer the Inbox item once through `AgentMessaging` with the request's outcome and, per step, its outcome, status and kept fields, and for a step whose value the user typed in the shell's secret dialog only "set on <day>", never the value; then it shall record the request's end, after which nothing of it runs again. Outside the desktop app the stepper shall run nothing, and **Decline** shall still answer the item.

## Examples

- Given the desktop app, signed in to GitHub as `acme-dev`, and an `acme/app` variable request,
  when the user runs step 1,
  then exactly that catalog step is sent and the record has `action.step.succeeded` for it.
- Given an `acme/app` request with an `acme.set-secret@1` step whose value the user types in the shell's dialog,
  when the step succeeds,
  then the answer says "set on 25 Nov 2026" for it, has no `value` field, and neither the answer nor the record holds the typed value.
- Given a request the user declined, so its record ends with `action.finished`,
  when it opens again and step 1 is run,
  then nothing is sent and the stepper says it was declined.
