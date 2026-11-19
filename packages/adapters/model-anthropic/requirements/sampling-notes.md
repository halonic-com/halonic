# model-anthropic.sampling-notes

- Status: active
- Since: unreleased
- Source: HAL-12285, point 2: tell the person which setting was left out and why, without failing the run; task HAL-12287. Wording from HAL-12285

When the Anthropic provider leaves a sampling setting out of a call (requirement `model-anthropic.sampling`), its answer shall have one note per setting left out, in `notes` (requirement `ports.provider-notes`), worded "Left out <setting>: <model> doesn't take it.", with the setting's wire name and the model as the call named it. A streamed call's `done` answer shall have the same notes as `chat()`. A call that left nothing out shall have no `notes`, and the call shall not fail because of them.

## Examples

- Given a call to `claude-sonnet-5-5` with `temperature: 0.3`,
  when it is answered,
  then the answer has the note "Left out temperature: claude-sonnet-5-5 doesn't take it."
- Given a streamed call to `claude-opus-4-7[1m]` with `topP: 0.9` and `top_k: 40` in `extra`,
  when it is answered,
  then the `done` answer has the notes "Left out top_p: claude-opus-4-7[1m] doesn't take it." and "Left out top_k: claude-opus-4-7[1m] doesn't take it."
- Given a call to `claude-sonnet-5-5` without sampling settings, or to `claude-haiku-4-5` with `temperature: 0.3`,
  when it is answered,
  then the answer has no `notes`.
