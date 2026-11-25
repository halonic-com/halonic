# contracts.agent-messaging

- Status: active
- Since: unreleased
- Source: HAL-17512 `server-engine` rev 2, §7 (PRs S2 and S3); task HAL-18493; questions: HAL-18762

The `AgentMessaging` contract shall pass for every `AgentMessaging`, whatever carries it, run over a `FakeAgentMessaging` behind it: each list and the search shall give what the fake holds, an item shall be answered once, an item's questions shall be answered only with an `answers` answer and no other item with one, a refusal shall keep its reason, a file sent with a message shall read back with the same bytes and type, every write to an offline source shall be refused with `offline`, a channel shall be started, left, joined and given new members, and `changes` shall name the source that changed. The fake itself passes it, and so does a transport such as the server's messaging routes.

## Examples

- Given the server's messaging routes with a fake behind them,
  when a message is sent with a file of the bytes `00 01 02 fa ff` and the file is read back,
  then the read gives the same bytes and type.
- Given an item answered once,
  when it is answered again over the transport,
  then the result is `already-answered` by `me`.
- Given an item asking two questions over the transport,
  when it is answered with one option, or a plain item is answered with `answers`,
  then the result is refused with `bad-answer`; answered with `answers`, it is `answered` and lists with its questions and that answer.
