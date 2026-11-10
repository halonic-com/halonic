# Decision: a stream fails on an error event or when it has no chunks

- Approval: Liam asked for both failures in his review of halonic#925 and approved the fix on HAL-3244; he approves this note in review
- Kind: internal
- Task: HAL-2284 (plan PR 2, streaming), review on HAL-3244

## What changes

`model-openai.call-errors` gains two cases for `stream()`:

- An error the server sends as a streamed event after it took the call with 200
  (`data: {"error":…}`, as OpenAI, vLLM, LiteLLM and Ollama do) fails with `refused`, or with
  `out-of-credit` when its type or code says so, read with the same rules as an error reply
  (HAL-3008). The message says the server stopped the answer and holds none of the server's text;
  the text goes on `cause`, shortened and filtered for keys, as for an error reply (HAL-2972).
- A stream without chunks (a server that ignores `stream: true` and sends one whole reply, or an
  empty body) fails with `refused`, caused by `ReplyFormatError`, as `chat()` does for the same body.

Nothing that `chat()` does changes.

## Why

Before, both cases ended the stream with a successful empty answer, so a run would carry on as if
the model had said nothing. Liam found both in review.

- A streamed error isn't `key-refused`, `model-missing` or `provider-busy`: those come from the
  HTTP status, and a streamed error has none. Only `out-of-credit` is read from the body, so only it
  carries over. Whether an "overloaded" event should be `provider-busy` is left for when a real
  server's events are recorded.
- No test was weakened. The new tests are in `openai-provider.test.ts` and `stream-reply.test.ts`.

## Covers

- model-openai.call-errors
