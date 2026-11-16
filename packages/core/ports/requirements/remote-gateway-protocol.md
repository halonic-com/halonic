# ports.remote-gateway-protocol

- Status: active
- Since: 0.2.0
- Source: tunnel phase A of the plan "phone reaches a runtime host through pluggable tunnels", approved by the board on 11 Nov; task HAL-5684

The remote gateway protocol (version 1) shall carry only sessions, their events, approvals and prompt input. A phone shall send `hello`, `list-sessions`, `watch`, `unwatch`, `answer-approval` and `prompt`, and nothing else; the host shall send `welcome`, `sessions`, `event`, `ok` and `error`. No message shall be larger than 64 KiB of UTF-8 JSON, and no prompt longer than 16,000 code units. A session shall resume after a reconnect by watching from the last event sequence the phone saw. The host shall answer a malformed, oversized or unknown message, or one sent before `hello`, with one `error` and close the connection.

## Examples

- Given the messages a phone may send,
  when their types are listed,
  then they are exactly `hello`, `list-sessions`, `watch`, `unwatch`, `answer-approval` and `prompt`.
- Given the messages the host may send,
  when their types are listed,
  then they are exactly `welcome`, `sessions`, `event`, `ok` and `error`.
- Given a phone message that asks to run a shell command or read a secret,
  when it is compiled,
  then it doesn't compile.
- Given a `prompt` of 16,000 code units, each a character that takes three bytes in UTF-8,
  when its size is checked,
  then it fits in one message with room for the envelope.
