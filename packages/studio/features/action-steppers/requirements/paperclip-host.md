# action-steppers.paperclip-host

- Status: draft
- Since: unreleased
- Source: HAL-20413 (approvals stream HAL-17488, follow-up to the review of the Paperclip Secrets steppers on HAL-17553); architecture note on HAL-17491, sections 2.4 and 7.6

When the user opens a Paperclip action item whose request names a `host`, the stepper shall run it only when that host is the host of a Paperclip the user connected in **Settings › Connections**, read again at each check. If it isn't, the stepper shall give the reason "`<host>` isn't a Paperclip you connected in Settings › Connections", draw no steps and offer only **Decline**. Where Studio has no connections, as in a browser, the stepper shall treat no host as connected.

## Examples

- Given a `paperclip.set-secret@1` request from a source the user allowed, with `host: "paperclip.acme.example"`, and the user connected `https://paperclip.acme.example`,
  when the user opens it in the desktop app signed in to Paperclip,
  then the stepper is ready to run.
- Given the same request with `host: "paperclip.other.example"`,
  when the user opens it,
  then the card says "`paperclip.other.example` isn't a Paperclip you connected in Settings › Connections" and draws no steps.
- Given a ready request on `paperclip.acme.example`,
  when the user disconnects that Paperclip and then runs a step,
  then the step doesn't run.
