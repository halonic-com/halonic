# Decision: a model that gives no first answer fails with `model-timeout`

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11049 (Liam approved the PR 6 split for T15, HAL-1308, with this engine reason as 6a; the reason name is Liam's decision on HAL-902; the review of halonic#3165 (HAL-11055) keeps the 10-minute limit)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:KVaZenqdFJIyD+EaYBD0kwvjSk2s/XEMN/ICJDGKmrdq6jeB5n2yWULmnLcsyouJ3Tc6lfPmGZ9ORO2Ac4jKCw==

`ModelCallErrorReason` gains `timeout` and `RunFailureReason` gains `model-timeout`, with the optional
`host` as `offline` has. The OpenAI-compatible provider (which Ollama uses) and the Anthropic provider
fail with `timeout` when no reply starts within their response limit, which stays 10 minutes by default. The engine's calls are not
streamed yet, so the limit still counts the whole answer; the move to 5 minutes to the first token
comes with streaming (HAL-11057). A reply that starts
and then goes silent stays `offline`. The engine treats a timeout like an offline model: the turn
moves to the next model, and when none is left the run fails with `model-timeout` and the host. The
engine core has no timers, so the limit lives in the providers. The CLI words the new reason from
the lines it already has.

One promise changes: a response timeout used to say `offline`, so the run's reason was
`model-unreachable`; it now says `timeout` and `model-timeout`. The default response limit does not
change: it stays 10 minutes, and the `limits` option still raises it. Logs without the reason read as before.

No test was weakened. The reason lists in the type tests gain `timeout` and `model-timeout`, and the
two response-timeout tests expect `timeout` where they expected `offline`; the 600 seconds stay.
New tests cover the fallback, the host, the run reason and the CLI lines.

## Covers

- cli.run-failure
- model-anthropic.call-limits
- model-openai.call-limits
- engine.offline-falls-back
- engine.run-failure-reason-of
- events.run-failed-model-unreachable
- events.run-failed-reason
- ports.model-call-error
