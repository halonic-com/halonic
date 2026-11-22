# cli.commands.runs.show-address-question

- Status: active
- Since: unreleased
- Source: HAL-16221 (C688 finding 1 on HAL-16219: `halonic runs` lists a run whose model call waits for the answer to Studio's "Allow this address?" as "! Needs you" since HAL-15831, but no command said how to answer; only Studio asks it, so the CLI points there; team wording under HAL-2282)

When a running run's model call waits for the answer to Studio's "Allow this address?" (an open `key-origin.asked`, requirement `events.summary-key-origin-asked`), `halonic runs show` shall end that run, after its step lines and a blank line, with "! Waiting for your answer in Studio: may provider "<provider>" send key "<key>" to <address>?" for the oldest open question and, indented under it, "Answer "Allow this address?" in Studio. Without an answer within 10 minutes, the model call fails." It shall never offer `halonic runs send` for it, since the CLI can't answer that question. The provider, key and address shall be made printable. A running run with no open question shall end with its step lines, as before.

## Examples

- Given a running run of Support reply whose step Draft a reply asked whether provider `gateway` may send key `gateway-key` to `https://gw.example`,
  when `halonic runs show <run-id>` is run,
  then it ends with "! Waiting for your answer in Studio: may provider "gateway" send key "gateway-key" to https://gw.example?" and "  Answer "Allow this address?" in Studio. Without an answer within 10 minutes, the model call fails.", and exits 0.
- Given the same run after the question was answered `allowed`,
  when `halonic runs show <run-id>` is run,
  then it ends with its step lines.
