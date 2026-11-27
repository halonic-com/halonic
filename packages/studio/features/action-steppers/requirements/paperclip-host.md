# action-steppers.paperclip-host

- Status: active
- Since: unreleased
- Source: HAL-20413 (approvals stream HAL-17488, follow-up to the review of the Paperclip Secrets steppers on HAL-17553); architecture note on HAL-17491, sections 2.4 and 7.6

When the user opens a Paperclip action item whose request names a `host`, the stepper shall run it only when that host is the host of a Paperclip connection in **Settings › Connections** whose key this computer holds, as this window last read the connections, and shall check that again before each step. If no connection has that host, the stepper shall give the reason "`<host>` isn't a Paperclip you connected in Settings › Connections". If a connection has that host but this computer holds no key for it, the stepper shall give the reason "`<host>` isn't signed in on this computer: sign in to it in Settings › Connections". With either reason, the stepper shall draw no steps and offer only **Decline**. Where the request's definition has `sign-in` steps, which make that key, the stepper shall accept a connection with that host whether or not this computer holds its key. Where Studio has no connections, as in a browser, the stepper shall treat no host as connected. Every page a shipped Paperclip definition opens, and every address its manual guide names, shall start with `https://{host}/`.

## Examples

- Given a `paperclip.set-secret@1` request from a source the user allowed, with `host: "paperclip.acme.example"`, and the user connected `https://paperclip.acme.example` with its key on this computer,
  when the user opens it in the desktop app signed in to Paperclip,
  then the stepper is ready to run.
- Given the same request with `host: "paperclip.other.example"`,
  when the user opens it,
  then the card says "`paperclip.other.example` isn't a Paperclip you connected in Settings › Connections" and draws no steps.
- Given the same request while the `paperclip.acme.example` connection holds no key on this computer,
  when the user opens it,
  then the card says "`paperclip.acme.example` isn't signed in on this computer: sign in to it in Settings › Connections" and draws no steps.
- Given a ready request on `paperclip.acme.example`,
  when the user disconnects that Paperclip, which forgets its key, and then runs a step,
  then the step doesn't run.
- Given a `paperclip.connect-and-test@1` request for the `acme` connection, whose file exists but holds no key yet,
  when the user opens it in the desktop app,
  then the stepper is ready to run.
