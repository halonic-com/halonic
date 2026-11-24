# ports.agent-messaging-attachments

- Status: active
- Since: unreleased
- Source: HAL-17422 plan, approved by the board on HAL-10 (24 Nov): feature 1, answer cards with media inline, and feature 6, send files and screenshots; ADR `docs/adr/2026-11-24-agent-messaging.md`; tasks HAL-17441 and HAL-17443

The `AgentMessaging` port shall list the files on each inbox item and each message as attachments with an opaque ID, a name, a media type and a size, and shall give an attachment's bytes only through one read call that the engine serves, so that an app never gets a provider's address for a file and loads none on its own. When a message is sent with files, the port shall send the message and its files together, or refuse it whole with `too-large` or `unsupported-type`, which the engine checks whatever an app checked before.

## Examples

- Given an inbox item with a screenshot,
  when the item is read,
  then it lists the screenshot with its name, its type and its size, and no address.
- Given that screenshot,
  when an app reads it through the port,
  then it gets the bytes and their type, or a refusal.
- Given a file larger than the engine takes,
  when a message is sent with it,
  then the result is `refused` with `too-large` and no message is sent.
