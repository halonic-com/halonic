# action-steppers.paperclip-host

- Status: active
- Since: unreleased
- Source: HAL-20413 (approvals stream HAL-17488, follow-up to the review of the Paperclip Secrets steppers on HAL-17553); architecture note on HAL-17491, sections 2.4 and 7.6

When the user opens a Paperclip action item whose request names a `host`, the stepper shall run it only when that host is the host of a Paperclip connection in **Settings › Connections** whose key this computer holds, as this window last read the connections, and shall check that again before each step. Until the window has first read the connections, the stepper shall neither refuse nor run such a request, and shall show it in review mode; once they are read, it shall check the request again in the same card. If no connection has that host, the stepper shall give the reason "`<host>` isn't a Paperclip you connected in Settings › Connections". If a connection has that host but this computer holds no key for it, the stepper shall give the reason "this computer isn't signed in to `<host>`: sign in to it in Settings › Connections". If the window couldn't read the connections, the stepper shall give the reason "Halonic couldn't read your connections in Settings › Connections". With any of these reasons, the stepper shall draw no steps and offer only **Decline**. Where the request's definition has `sign-in` steps, which make that key, the stepper shall accept a connection with that host whether or not this computer holds its key. Where Studio has no connections, as in a browser, the stepper shall treat no host as connected. Every page a shipped Paperclip definition opens, and every address its manual guide names, shall start with `https://{host}/`.

## Examples

- Given a `paperclip.set-secret@1` request from a source the user allowed, with `host: "paperclip.acme.example"`, and the user connected `https://paperclip.acme.example` with its key on this computer,
  when the user opens it in the desktop app signed in to Paperclip,
  then the stepper is ready to run.
- Given the same request with `host: "paperclip.other.example"`,
  when the user opens it,
  then the card says "`paperclip.other.example` isn't a Paperclip you connected in Settings › Connections" and draws no steps.
- Given the same request while the `paperclip.acme.example` connection holds no key on this computer,
  when the user opens it,
  then the card says "this computer isn't signed in to `paperclip.acme.example`: sign in to it in Settings › Connections" and draws no steps.
- Given the same request opened before the window has read the connections,
  when the connections are read and list `https://paperclip.acme.example` with its key on this computer,
  then the card gives no reason while they are read, and the stepper is then ready to run.
- Given the same request while reading the connections fails,
  when the user opens it,
  then the card says "Halonic couldn't read your connections in Settings › Connections" and offers only **Decline**.
- Given a ready request on `paperclip.acme.example`,
  when the user disconnects that Paperclip, which forgets its key, and then runs a step,
  then the step doesn't run.
- Given a `paperclip.connect-and-test@1` request for the `acme` connection, whose file exists but holds no key yet,
  when the user opens it in the desktop app,
  then the stepper is ready to run.
