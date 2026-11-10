# Decision: the bridge's close() waits for its routes, and nothing is recorded after it

- Requirement: `harness-bridge.server` (`packages/adapters/harness-bridge/requirements/server.md`)
- Task: HAL-2553 (B3), the change Liam asked for in his review of #680 on HAL-2334
- Approval: the task asks for this change; the maintainer approves this note in review (HAL-2648)

## What changes

Until now `close()` resolved once the bridge's connections had ended. A route that records a call's
spend after its request is aborted, as the Anthropic route does for a reply cut short (#769), could
still be running then, and its `llm.response` could land after the engine counted the run as
finished. The requirement now says:

- `close()` resolves once the requests in flight have ended **and their routes have settled**, or
  once the close time limit has passed (`closeTimeoutMs`, 5 seconds unless the server is given
  another; it must be a whole number, 0 or more). The limit keeps a stuck route, for example one
  waiting on a provider that never answers, from holding up the end of the run.
- After that the bridge records no event for the run: a route still running past the limit has its
  `record()` refused with `conflict`. An event a route asked to record before the limit passed is
  waited for, even past the limit, so it can't land after `close()` resolves either. A recorder is
  Halonic's own code, not the harness's, so waiting on it doesn't let a harness hold up the run.
- Three examples are added: a route recording its spend once aborted, a route stuck past the limit,
  and an event still being recorded when the limit passes.

The `OpenHarnessBridge.close()` doc comment in `@halonicjs/ports` says the same.

## Tests

No test was weakened. The existing test "aborts requests in flight, then refuses new ones" used a
route whose handler never settled (`new Promise(() => {})`). With this change `close()` would wait
the full time limit for it, so that route now resolves when its request's signal aborts, as every
real route does. The test still checks the same things: the signal aborts, `close()` resolves and
a new request can't connect.

The new tests use gates the test opens instead of sleeps, and fake timers for the close time limit.
