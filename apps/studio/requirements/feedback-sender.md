# studio.feedback-sender

- Status: active
- Since: unreleased
- Source: HAL-19240 (plan approved by Liam on HAL-19671); the agent host's route in `services.feedback-send`

When the desktop app sends a feedback for an open folder, it shall send it through the agent host
and the folder's first Paperclip connection that holds its key on this computer, online or offline,
naming the folder by its real path as the host lists it, and shall carry the screenshot only when the
feedback has one. When the agent host isn't answering, the app shall answer `offline`, and when no
connection of the folder holds its key, `not-connected`, sending nothing. When the host refuses the
feedback, the app shall answer `refused` with no reason, as the host keeps Paperclip's words to
itself. When the feedback is sent, the app shall answer with the task's page and its ID, the last
part of the page's path.

## Examples

- Given Acme with a signed-out connection and then a signed-in one,
  when Studio sends "Run list jumps" with its crop,
  then the host gets it once, for the signed-in connection and Acme's real path, with the PNG.
- Given an agent host that isn't running,
  when Studio sends a feedback,
  then the answer is `offline`.
- Given a task made at `https://paperclip.acme.test/ACME/issues/ACME-12`,
  when the answer comes,
  then the task's ID is ACME-12.
