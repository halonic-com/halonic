# Decision: adapter tests wait with `waitUntil`, so their expect count is fixed

- Task: HAL-9816 (follow-up to HAL-9336)
- Approval: HAL-9816 asks for this change; Liam approves this note in review
- Kind: internal

## What changes

36 `vi.waitFor(() => expect(...))` calls in the adapter tests now wait with `waitUntil` from
`@halonicjs/testing-spec`, which names what it waits for and gives up after a deadline, and then
check the same thing once with `expect`. Every test checks exactly what it checked before. The
`expect` count of each requirement goes down to the lowest number a run could ever have reached,
and then stays the same on every run.

The waits now poll every 10 ms (`vi.waitFor` polled every 50 ms) and give up after 4 s, or just
under `HALONIC_TEST_TIMEOUT` when it is set (`vi.waitFor` gave up after 1 s). One wait in the
sandbox-srt test needs no `expect` after it, because its `waitUntil` already proves what the
removed `expect` said and the test checks it again a few lines later.

## Why

`vi.waitFor` runs its callback again on every try, so every retry counted as one more `expect`.
The guard compares that count with the base commit's, so a slow run could fail a pull request
that did not touch the test (HAL-9336). These edits touch the test files, so the guard's
`vi.waitFor` exception (HAL-6369) does not apply to them: the drop is real, and it is the last
one, because the count can no longer vary with timing.

## Covers

- agent-host-client.bridge-socket
- agent-host-client.bridges
- cloudflare-durable.run-events-subscription
- cloudflare-durable.run-list-outbox
- cloudflare-durable.timers
- cloudflare-durable.watchdog
- connector-stdio-sandbox.call-timeout
- connector-stdio-sandbox.declared-tools
- connector-stdio-sandbox.session-start
- harness-bridge.openai
- harness-bridge.spend
- mcp.pinned-launcher
- mcp.stdio-transport
- model-anthropic.call-error-details
- model-anthropic.call-errors
- model-anthropic.endpoint
- model-anthropic.reply-size
- model-openai.call-error-details
- model-openai.call-errors
- model-openai.endpoint
- model-openai.reply-size
- sandbox-mxc.session
- sandbox-srt.check
- sandbox-srt.remove
- sandbox-srt.setup
- scheduler-node.wake-up-failure
