# studio.feedback-sender

- Status: active
- Since: unreleased
- Source: HAL-19240 (plan approved by Liam on HAL-19671); the agent host's route in `services.feedback-send`

When the desktop app sends a feedback for an open folder and one of its Paperclip connections, it
shall send it through the agent host and that connection, while it holds its key on this computer,
online or offline, naming the folder by its real path as the host lists it, and shall carry the
screenshot only when the feedback has one. When the agent host isn't answering, before or while it
sends, the app shall answer `offline`, and when that connection doesn't hold its key, even while
another of the folder's does, `not-connected`, sending nothing. When the host refuses the
feedback, the app shall answer `refused` with no reason, as the host keeps Paperclip's words to
itself. When the feedback is sent, the app shall answer with the task's page and its ID, the last
part of the page's path.

## Examples

- Given Acme with two signed-in connections, other and board,
  when Studio sends "Run list jumps" with its crop through board,
  then the host gets it once, for board and Acme's real path, with the PNG.
- Given an agent host that isn't running, or stops answering as the feedback goes,
  when Studio sends a feedback,
  then the answer is `offline`.
- Given Acme's board connection without its key and its other connection signed in,
  when Studio sends a feedback through board,
  then the answer is `not-connected` and nothing is sent.
- Given a task made at `https://paperclip.acme.test/ACME/issues/ACME-12`,
  when the answer comes,
  then the task's ID is ACME-12.
