# assistant.chat.trust-check

- Status: active
- Since: unreleased
- Source: HAL-16797 (T14 PR 7); states H16 (HAL-5896); flow-assistant 5.9 (HAL-647); HAL-720; microcopy 8.3 and 14.1 (HAL-751)

When the Assistant host refuses a Build chat's message because the workspace isn't trusted (`isUntrustedRefusal`), nothing was sent: the chat shall go back to how it was before the message, announce nothing, and open the window's trust check. When the person trusts the workspace there, the chat shall send the message. When they choose Not now, or there is no trust check to open, the message shall go back in the box, unless the person already wrote another, and a toast shall say "Not started: *Acme* isn't trusted yet", with **Review**, which opens the trust check again, where there is one.

## Examples

- Given a workspace that isn't trusted, when the person sends "Add a routine" and trusts the workspace in the trust check,
  then "Add a routine" is sent and the box is empty.
- Given a workspace that isn't trusted, when the person sends "Add a routine" and chooses Not now,
  then the chat is still empty, "Add a routine" is back in the box, and the toast reads "Not started: Acme isn't trusted yet" with Review.
