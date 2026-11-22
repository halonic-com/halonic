# engine.task-answer-json-found

- Status: active
- Since: unreleased
- Source: HAL-16441, the board's analysis of 62 DeepSeek runs on HAL-16440 (22 Nov)

When a `task` state's agent has `answerRetries` 1, or the state has a transition on `unusable` (`engine.task-unusable-route`), its output is `json`, and its text answer isn't JSON on its own or inside one Markdown code fence around the whole answer, the engine shall look for the JSON in the answer before it counts the answer as unusable: the one code fence in the answer tagged `json` or untagged, or, when there is no such fence, the one complete top-level `{…}` object in the text. When there is exactly one and it parses, the engine shall keep it as the step's output, as it keeps a JSON answer. When there is none, more than one, or the one doesn't parse, the answer is unusable, and the engine asks again or fails the run (`engine.task-answer-retries`). The engine never picks one of several. Without `answerRetries`, an answer that isn't JSON as a whole fails the run, as before. A `parallel` branch and a `foreach` item don't look.

## Examples

- Given a `json` agent with `answerRetries: 1` that answers "Here is the plan:" and a `json` code fence with `{"steps": 2}`,
  when the answer comes back,
  then the step's output is `{ steps: 2 }` and the run goes on without a retry.
- Given the same agent answering `The plan is {"steps": 2}, as asked.`,
  when the answer comes back,
  then the step's output is `{ steps: 2 }`.
- Given the same agent answering with two `json` code fences, or with prose that has two `{…}` objects,
  when the answer comes back,
  then the answer is unusable and the agent is asked again.
- Given the same agent answering with prose only,
  when the answer comes back,
  then the answer is unusable and the agent is asked again.
- Given a `json` agent without `answerRetries` that answers "Here is the plan:" and a `json` code fence,
  when the answer comes back,
  then the run fails with `answer.not-json`, as before.
