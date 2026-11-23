# kit.chat-reply-busy

- Status: draft
- Since: unreleased
- Source: HAL-17115; streaming plan (HAL-17106, approved on HAL-17113); a11y A6

When the feature says a `ChatMessage` reply is busy, the kit shall mark the reply `aria-busy`, so a screen reader may wait for it to end before reading the change. A reply that isn't busy, or doesn't say, shall have no `aria-busy`.

## Examples

- Given a ChatMessage from "reply" that is busy,
  when it renders,
  then it is `aria-busy`.
- Given the same reply once it no longer is busy,
  when it renders,
  then it has no `aria-busy`.
