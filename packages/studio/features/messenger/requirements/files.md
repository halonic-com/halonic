# messenger.files

- Status: active
- Since: unreleased
- Source: HAL-17422 plan, approved by the board on HAL-10 (24 Nov); ADR `docs/adr/2026-11-24-agent-messaging.md` (feature 6, Attachments and Sending files); Julian's security review HAL-17436 (finding 3); HAL-17443.

In a conversation, the Messenger shall let the person attach files, or paste a screenshot, and send them with a message through `AgentMessaging.send`. When a file is over 10 MB, of a type the port doesn't send, or one too many, it shall refuse to add it and say why. It shall show each file on a message by its name and size, and shall read a picture's bytes through `AgentMessaging.readAttachment` and show the picture only after the person asks to see it, drawn from those bytes, never from an address.

## Examples

- Given the chat with Chief,
  when the board pastes the screenshot `login.png`, types "Here" and sends,
  then `AgentMessaging.send` gets "Here" and `login.png`'s bytes, and the message shows "Show login.png".
- Given that message,
  when the board picks "Show login.png",
  then the picture is read through `AgentMessaging.readAttachment` and shows in the chat.
- Given a file `dump.txt` of 11 MB,
  when the board attaches it,
  then it isn't added and the chat says "dump.txt is over 10 MB, so it wasn't added."
