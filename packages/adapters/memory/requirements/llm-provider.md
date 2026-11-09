# memory.llm-provider

- Status: active
- Since: 0.1.0
- Source: HAL-181; `LlmProvider` port v1

The scripted model provider shall play the calls scripted with `answerNext`, `hangNext` and `refuseNext` in order, and never reach a vendor. It shall keep its own copy of each scripted answer, so changing the answer afterwards changes nothing. Its id shall be `scripted` unless set, and it shall offer `stream()` only when created with `streaming: true`. A streamed answer shall come in pieces of four characters, and an aborted signal shall stop it at the next piece. A call with nothing scripted shall reject without counting as started, and a hanging call without a signal shall reject rather than wait forever.

## Examples

- Given nothing is scripted,
  when `chat` is called,
  then it rejects with "The scripted model scripted has no more calls."
- Given a streamed text answer `Hello …`,
  when the signal aborts after the first piece,
  then the stream has yielded only `Hell` and ends with an error.
