# cli.commands.serve.pair

- Status: active
- Since: unreleased
- Source: HAL-18561 (S6b, the console half of `server.device-pairing`); HAL-17512 `server-engine` rev 2, §5 (the console uses the `serve` subcommands, not HTTP); Julian's console channel note on HAL-18561

The `halonic serve pair` command shall, on the computer that runs `halonic serve` for the workspace, ask the running server over its console channel (`runtime.console-socket`) for a one-time pairing code and print it as "Pairing code: ABCD-EFGH", in two groups of four, with a line saying it works once, for 10 minutes. It shall then read, every half second, the request made with that code only, never one made with another code, and show the device's name and its check code and ask "Allow <device>?". On yes it shall allow the request as `console`, print "✓ <device> is paired." and exit 0; on no it shall allow nothing and exit 1. After 10 minutes with none allowed it shall say the code ran out and exit 1. When no `serve-password` is set it shall make no code, say so and name `halonic secret set serve-password` (exit 2). When no `serve` runs for the workspace it shall say so and say to start one. A device's name shall be made printable before it is shown. When `serve` can't open its console channel, such as for a path too long for a socket, it shall go on serving and say on stderr that `serve pair` and `serve devices` won't work, and why.

Rationale: pairing is allowed by the person at the server, who compares the check code on both screens; the console channel needs no password because only that person's user can open it.

## Examples

- Given a running `serve`, when `serve pair` prints its code and a device sends it with `POST /api/pair`, and the person answers yes, then `POST /api/pair/status` gives that device its token once.
- Given the person answers no, then the device's request stays waiting and no token is given.
- Given a `serve` whose console channel can't open, then it serves, and a `!` line on stderr names `serve pair` and why.
- Given no `serve-password`, then `serve pair` exits 2 with "Set one first with: halonic secret set serve-password".
