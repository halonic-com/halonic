# Decision: serve's webhook 500 follows F16, and a webhook routine that starts an agent gets a ✕ line

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15277 (words check C557, rows 58 and 59; a small fix on an approved screen, decided by the team under HAL-2282)
- Kind: user-visible

A web request that fails inside the server with a 500 is a bug, so `halonic serve` now prints the
error shape's F16 lines (microcopy 25.1 L4) instead of "· see why with --debug": "✕ Weekly report
didn't start on a web request: Halonic ran into a problem it can't explain yet." and, indented,
"Start halonic serve again with --debug to see the details, and report it: …issues". `--debug` is a
flag serve starts with, so line 2 says to start it again. With `--debug` on, the cause is printed
already, so line 2 only asks for the report, as `run` does (HAL-6613).

A webhook routine that starts an agent gets a ✕ line under its address when serve starts, in the
words of microcopy 1.5 L2, because the server answers every request for it with 501 until agent
runs are built. Before, serve printed nothing and the how-to promised the agent would start.

No test was weakened: the 500 test now checks both lines, and new tests cover `--debug` and the
agent routine.

## Covers

- cli.commands.serve.serve
- cli.commands.serve.webhook-refusals
