# ports.paperclip-source

- Status: active
- Since: unreleased
- Source: HAL-17422 plan, approved by the board on HAL-10 (24 Nov); ADR `docs/adr/2026-11-24-paperclip-connection.md`; task HAL-17425

The ports package shall have a `PaperclipSource` port for one Paperclip connection whose only calls are `listAgents`, `listProjects`, `listTasks`, `listComments`, `listCards`, `answerCard` and `commentOnChat`, where every item names its connection, its company and its Paperclip ID, every read says how fresh it is and whether it came from the cache offline, and a write is either sent at once or refused with `offline`, `not-found` or `not-a-chat`, never queued.

The port's documentation shall state that these calls are the whole list, that a new call needs a new port version and a security review, and that an item of another connection or company is `not-found`.

## Examples

- Given the `PaperclipSource` port,
  when its members are read,
  then they are exactly `connection`, `company` and the seven calls.
- Given a `PaperclipItemId` without a connection or without a company,
  when it is compiled,
  then it doesn't compile.
- Given a `PaperclipAnswerResult` with the outcome `queued`,
  when it is compiled,
  then it doesn't compile.
