# inbox.agent-item-media

- Status: active
- Since: unreleased
- Source: HAL-17422 plan, approved by the board on HAL-10 (24 Nov): feature 1, answer cards with media inline; Julian's security review HAL-17436 (finding 3, no image loads on its own); ADR `docs/adr/2026-11-24-agent-messaging.md`; task HAL-17441

The Inbox shall list each file on an `AgentMessaging` inbox item in its card with the file's name and size. When the person asks to see a PNG, JPEG, GIF or WebP image, the Inbox shall read its bytes through `AgentMessaging.readAttachment` and draw it inline in the card. The Inbox shall read no file before the person asks, and shall draw no other type of file.

## Examples

- Given a card with the screenshot "login.png",
  when the card is opened,
  then it shows "login.png" and its size, and no file is read.
- Given that card,
  when the person presses Show image,
  then the screenshot's bytes are read through the engine and the picture shows in the card.
- Given a card with an SVG file,
  when the card is opened,
  then it shows the file's name and size and offers no way to draw it.
