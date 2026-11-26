# agent-host.messaging-hub-attachments

- Status: active
- Since: unreleased
- Source: HAL-17441 (Inbox media, track B2) and HAL-17443 (Messenger files, track C2); ADR `docs/adr/2026-11-24-agent-messaging.md` ("Attachments"); requirement `ports.agent-messaging-attachments`

When an app reads an attachment's bytes, the agent host shall read them only from the provider that listed that attachment on an inbox item or on a conversation's message, and refuse an attachment that no provider listed with `not-found` without asking any provider for its bytes. When the person sends a message with files, the agent host shall pass the files only to the provider that listed the conversation.

## Examples

- Given a message with a screenshot listed by the second provider,
  when the person opens the screenshot,
  then only the second provider is asked for its bytes.
- Given an attachment ID no provider listed,
  when an app reads it,
  then the read is `refused` with `not-found`, and no provider is asked.
- Given a conversation listed by the second provider,
  when the person sends a message with a file,
  then the second provider gets the message with that file.
