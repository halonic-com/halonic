# tunnel-attacks.protocol-escape

- Status: active
- Since: unreleased
- Source: tunnel phase A4 of the plan "phone reaches a runtime host through pluggable tunnels", approved by the board on 11 Nov; task HAL-5687

The remote gateway shall let a greeted phone ask the host for the protocol's six messages and nothing else: not to run a command, write a file, read a file or a secret, change a setting, call a tool or reach the bridge, whatever it names the request, whatever fields it adds to a message of the protocol, and whatever it puts in an id or a prompt. It shall pass a prompt to the host as the text it is and as nothing more, and it shall leave a risky approval unanswered until the person allows remote answers on the desktop.

## Examples

- Given a greeted phone,
  when it sends `run-command`, `shell`, `exec`, `write-file`, `read-file`, `get-secret`, `set-setting`, `tools/call` or a JSON-RPC request,
  then the host sends `malformed`, closes and asks the session source for nothing.
- Given a message of the protocol with one more field, such as a `risk` on `answer-approval`, a `tools` or a `cwd` on `prompt`, or a `__proto__`,
  then the host sends `malformed` and the approval or prompt goes nowhere.
- Given an id that is empty, 129 characters long, a path, or holds a NUL, a space, a slash or non-ASCII letters,
  then the host sends `malformed`.
- Given a prompt whose text is a shell command, a path or a request for a secret,
  then the source gets that text, once, as a prompt for the session named, and nothing else.
- Given a risky approval and the default policy,
  when the phone answers it with approve, with the approval's id in another case or with another session's name,
  then the host sends `not-allowed-remotely` or `unknown-approval` and the source gets no answer.
- Given the person has allowed risky answers on the desktop,
  then the same answer reaches the source once.
