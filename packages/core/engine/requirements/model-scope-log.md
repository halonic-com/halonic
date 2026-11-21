# engine.model-scope-log

- Status: active
- Since: unreleased
- Source: HAL-11873 (Studio's "Allow this address?" prompt, step B c of HAL-11343)

When the engine picks the model for a run's model call, it shall give the host the run's id, the run's log and the call's stop, so a host that asks a person something while the model is picked can stop waiting when the call is stopped and write the answer to the run's log as a `key-origin.answered` event, before the call's own events. A subagent's model call shall get the run's id and log, without a stop. A chat turn outside any run shall get none of them.

## Examples

- Given a run whose model is picked by a host that writes a `key-origin.answered` event to the log it gets,
  when the run's model call is made,
  then the host got a stop that isn't stopped, and the run's log has that event before the call's `llm.request`.
