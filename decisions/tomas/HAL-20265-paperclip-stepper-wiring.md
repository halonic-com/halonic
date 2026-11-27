# Decision: the Paperclip sign-in stepper runs from the Inbox, and resumes without a second key

- Approval: /HAL/issues/HAL-20452 (Liam approved the HAL-20265 plan; follow-ups from Julian's reviews of #6694 and #6695 on HAL-17545)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:2YNI7tY+AR/8ds8sbRO+GGGSTvnmgHWNC9xl104V0e7hKUnVUfi1RSNVLZcamkxjzC+D9M0U7RGP+pQI17GbAg==

The Inbox card now gets the desktop app's `ServiceSignIn` (a `HostServiceSignIn`
over the same connections Settings › Connections uses, provided under
`serviceSignInKey`). Once the Inbox also has the action steps app service, a
`paperclip.connect-and-test@1` request runs instead of showing as not
available. Users see none of this yet: nothing in the app provides the action
steps (`provideActionSteps`), the catalog or the requester policy. #6789
(HAL-18125) gives the steps their records, and HAL-18517 provides them in the
app.

What users do see: the Inbox's and the Messenger's own windows now open
outside pages with the desktop app's `openExternal`, as Studio's window does.
Without it the kit called `window.open`, which the shell ignores, so their
links went nowhere, and a sign-in's approval page would have opened nowhere.

- `studio.focused-app-window` says so, with an example.
- `inbox.agent-action-run` says the sign-in runs once both services are there.
- `action-steppers.stepper-resume`: a sign-in whose `keep` part is recorded
  and that isn't a test now resumes at the parts left. It no longer starts
  again from its first part, which would make a second key. A test sign-in
  still starts again, because closing revoked its key.
- `action-steppers.paperclip-sign-in-run`: when the stepper opens again, a
  test sign-in whose step 4 isn't recorded shows steps 1 to 3 as not done.
  The reopened screen used to offer step 4 for a key that was gone. The
  regression test now checks the step the screen offers, instead of running
  step 1 itself, and a new test covers a connect sign-in going on at step 4.
  The `already-signed-in` refusal now covers a sign-in that isn't a test too
  (#6795), so its text says what to do next: "This connection is already
  signed in. Disconnect it in Settings › Connections first, then try again."
- `action-steppers.paperclip-sign-in-review`: what the request touches names
  its Paperclip "<host>, from this workspace's connection file". The host
  binding (`action-steppers.paperclip-host`) has checked that address by then.
- The manual guide's first instruction now says to check that the address
  matches the one in **Settings › Connections**. The catalog test's expected
  guide gains that line. A definition without a manual form on a `sign-in`
  step is now named "a sign-in step", not "an API step".

## Covers

- studio.focused-app-window
- action-steppers.stepper-resume
- action-steppers.paperclip-sign-in-run
- action-steppers.paperclip-sign-in-review
- inbox.agent-action-run
