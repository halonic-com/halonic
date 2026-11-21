# cli.commands.serve.webhook-refusals

- Status: active
- Since: unreleased
- Source: HAL-15084 (C540 #5: a refused webhook delivery was silent in the terminal); `cli.commands.serve.serve`; `server.webhooks`

When a webhook routine that is on has a trigger value `halonic validate` reports, such as `{{trigger.date}}`, the `halonic serve` command shall print, under that routine's "starts on a web request" line, a ✕ line with validate's reason: "✕ Weekly report won't start: {{trigger.date}} isn't a trigger value. Use …". When a routine has more than one, the line shall give the first, the one a start stops at.

While it serves, when the server answers a web request to a webhook address with 400, the command shall print "✕ Weekly report didn't start on a web request: " and the reason the server gave the sender. When it answers 500, the line shall say "✕ Weekly report didn't start on a web request · see why with --debug", and the cause shall show with `--debug`, as for any failed request. The line shall name the routine by its name, or by its address when no routine is there. It shall print nothing for any other answer, such as 401 for a request that isn't signed with the routine's secret, which anyone who can reach the address may send.

Rationale: the server refuses such a delivery and tells only the sender. The person at the terminal saw the routine's address and then nothing, so a webhook that never started looked like one that was never sent.

## Examples

- Given a webhook routine Weekly report whose input has `{{trigger.date}}`, when `halonic serve` starts, then the line under its address says it won't start and why.
- Given that routine and a signed delivery to it, then the server answers 400 `invalid_input` and the terminal prints "✕ Weekly report didn't start on a web request: {{trigger.date}} isn't a trigger value. …".
- Given a delivery that fails inside the server, then the terminal prints the line that points to `--debug`.
- Given a delivery with a wrong signature, then the server answers 401 and the terminal prints nothing.
