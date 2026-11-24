# Decision: two attachment requirements also cover sending files

- Approval: HAL-17443 (Liam's review of #5644, with Chief's go-ahead on the task)
- Kind: internal

C2 adds sending a message with files (feature 6 of the HAL-17422 plan, approved
by the board on HAL-10). B2 (#5643) adds the requirements for listing and
reading attachments. Sending files goes through the same port and the same hub,
so C2 extends those two requirements instead of adding two new ones next to
them. Each gains one sentence and one example; nothing B2's text requires is
removed or weakened.

- `ports.agent-messaging-attachments`: a message sent with files is sent whole
  with its files, or refused whole with `too-large` or `unsupported-type`, which
  the engine checks whatever an app checked before.
- `agent-host.messaging-hub-attachments`: the hub passes a message's files only
  to the provider that listed the conversation.

## Covers

- ports.agent-messaging-attachments
- agent-host.messaging-hub-attachments
