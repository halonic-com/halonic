# engine.chat-text-deltas

- Status: active
- Since: unreleased
- Source: HAL-17114, PR 1 of the streaming plan on HAL-17106, approved by Liam on HAL-17113 with the condition that any thrown-away text, a retry on the same model included, is followed by a `restart`

When a chat turn's request has an `onText` listener and the turn runs on a model whose provider streams (requirement `engine.model-calls-stream`), the local executor shall pass each non-empty text piece of the stream to it as a `delta`, as the piece comes. Before each model call of the turn that follows a `delta`, whether the chain moves on to another model or tries the same one again after a call failed part way, or the turn asks the model again after running its own tools, it shall send one `restart`, so the text after a `restart` never holds text from before it, and after the last one the deltas add up to the turn's answer. It shall send no `restart` before any text was sent. A model whose provider can't stream shall answer as before, and the listener shall hear nothing from it. A chat turn that runs in a harness doesn't stream yet.

## Examples

- Given a streaming model that writes "Found it" in two pieces,
  when a chat turn runs with `onText`,
  then the listener hears the two deltas, and they add up to the answer.
- Given `local` that streams part of an answer and then goes offline, falling back to `smart`,
  when a chat turn runs with `onText`,
  then the listener hears the partial deltas, a `restart`, then `smart`'s deltas, and the text after the `restart` is only `smart`'s answer.
- Given a model that fails part way and is tried again through a fallback alias for the same model,
  when a chat turn runs with `onText`,
  then a `restart` comes between the two calls' text.
- Given a model that writes "Let me look" with a call to a Halonic tool, then answers "Found INV-7",
  when a chat turn runs with `onText`,
  then a `restart` comes before the second round's text, and the text shown at the end is "Found INV-7".
- Given a provider that can't stream,
  when a chat turn runs with `onText`,
  then it answers as before and the listener hears nothing.
