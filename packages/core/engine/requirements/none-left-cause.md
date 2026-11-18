# engine.none-left-cause

- Status: active
- Since: unreleased
- Source: HAL-12606 (a proxy failure read as "check your internet connection": the reason was lost when no model was left)

When a turn fails because no model is left after a call that moved on (requirement `engine.offline-falls-back`), its `ModelCallError` shall keep that call's error as its `cause`, with that error's host and typed cause (`kind` and `failureCause`, requirement `ports.model-call-cause`), and its message shall end with that error's own message, so `run.failed` can say a proxy refused rather than that nothing answered, and `--debug` shows why.

## Examples

- Given the alias `smart`, whose call failed `offline` at `api.acme.test` with the typed cause `proxy.refused`, and no fallback,
  when a chat turn runs,
  then it fails with a `ModelCallError` whose reason is `offline`, whose host is `api.acme.test`, whose `cause` is that error, whose `failureCause` is `proxy.refused`, and whose message is "no model reachable (tried smart): " followed by that error's message.
- Given the alias `smart` falling back to `backup`, both busy,
  when a chat turn runs,
  then the message ends with `backup`'s own message.
