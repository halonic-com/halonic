# events.summary-key-origin-asked

- Status: active
- Since: unreleased
- Source: HAL-15831 (flow check C638 #5): a run that waits for "Allow this address?" shows Needs you on its row; Liam's plan decision on HAL-15831

A run's summary shall hold, in `keyOriginAsked`, the questions "Allow this address?" still waiting for a person's answer, oldest first, each with its `provider`, `key` and `origin` (requirement `events.key-origin-asked`), and leave the field out when none is open. A `key-origin.asked` shall open a question. Its `key-origin.answered` for the same key and address shall close it. An event that shows the call may have ended without an answer shall close every open question: an `agent.started` without `parent`, any `agent.finished`, `state.entered`, `run.waiting`, or the run's end. Any other event, such as a subagent's model call or a tool call, shall leave them open.

## Examples

- Given a log whose last event is `key-origin.asked` for key `gateway-key` and https://gateway.example.com,
  when it is summarized,
  then `keyOriginAsked` holds that question.
- Given the same log followed by a subagent's `llm.request` and a `tool.called`,
  when it is summarized,
  then `keyOriginAsked` still holds the question.
- Given the same log followed by `key-origin.answered` for that key and address,
  when it is summarized,
  then the summary has no `keyOriginAsked`.
- Given two questions for different keys, and an answer for the second,
  when they are summarized,
  then `keyOriginAsked` holds only the first.
- Given the question followed by `agent.started` without `parent`, `agent.finished`, or `run.failed`,
  when it is summarized,
  then the summary has no `keyOriginAsked`.
