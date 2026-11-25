# agent-host.feedback-send-route

- Status: active
- Since: unreleased
- Source: HAL-18969 (PR B of the screenshot feedback shortcut, HAL-18563); Liam's plan approval on HAL-18919 (the agent host sends, so a key never reaches a page; the same launch token check; the 10 MB limit before parsing; only four outcomes); `paperclip-client.feedback-tasks`, `agent-host.paperclip-key`

When Studio posts a feedback to `POST /v1/paperclip/feedback` with a workspace, a Paperclip connection, the feedback's ID, a title of at most 80 characters, a description, the project and the assignee by name and, optionally, a PNG screenshot as base64, the agent host shall send it with `PaperclipFeedback` through the key it holds for that workspace's connection, behind the same key guard as the connection's messaging, and shall answer `{ outcome }`: `sent` with the task's page, `offline`, `not-connected` when it holds no key, or `refused`. The answer and the host's log shall never hold Paperclip's words or the key. The host shall refuse a body over 10 MB with 413 `body_too_large` before reading it as JSON, a body that doesn't fit or a screenshot that isn't a PNG with 400 `body_invalid`, a folder that isn't a workspace the launcher named with 404 `unknown_workspace`, and a request without this launch's token as every route does, each sending nothing.

## Examples

- Given a connected Acme Paperclip with the project Website and the agent Ada,
  when Studio sends "The Runs list jumps" with a PNG for Ada in Website,
  then Paperclip has a `todo` task for Ada with the PNG attached, and the answer is `sent` with the task's page.
- Given a Paperclip that refuses the task with its own reason,
  when Studio sends the feedback,
  then the answer is `refused` and neither it nor the log holds that reason.
- Given a workspace whose connection Studio hasn't connected,
  when Studio sends a feedback,
  then the answer is `not-connected` and nobody is called.
- Given a body of 10 MB and one byte that isn't JSON,
  when it is posted,
  then the host answers 413 `body_too_large`, not 400 `body_not_json`.
- Given a request without the launch token,
  when it is posted,
  then the host answers 401 and nobody is called.

## What it doesn't cover

Keeping a feedback to send later, and the windows that send it, are Studio's (HAL-18971). The route sits under `/v1/paperclip/` so that on Windows the shell sends it to the messaging-only host, which holds the keys (`agent-host.messaging-only`).
