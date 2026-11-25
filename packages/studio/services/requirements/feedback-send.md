# services.feedback-send

- Status: active
- Since: unreleased
- Source: HAL-18969 (PR B of the screenshot feedback shortcut, HAL-18563); Liam's plan approval on HAL-18919 (the agent host sends, so a key never reaches a page); `agent-host.feedback-send-route`

When Studio sends a screenshot feedback, `AgentHostFeedback` shall post it to the agent host's `POST /v1/paperclip/feedback` with the screenshot's PNG as base64, and shall answer `sent` with the task's page, `offline`, `not-connected` or `refused`, as the host answers. It shall answer `offline` when the host isn't answering, `refused` when the host refuses the body (413 or 400), and `not-connected` when the host doesn't serve the workspace (404), and shall fail with the host's error for any other answer.

## Examples

- Given a host that made the task,
  when Studio sends "The Runs list jumps" with its crop,
  then the host gets the PNG as base64 and the answer is `sent` with the task's page.
- Given a host that isn't running,
  when Studio sends a feedback,
  then the answer is `offline`, so the feedback waits to be sent again.
- Given a host that answers 413 `body_too_large`,
  when Studio sends a feedback,
  then the answer is `refused`.
- Given a host that answers 401,
  when Studio sends a feedback,
  then the send fails with an `AgentHostError`.
