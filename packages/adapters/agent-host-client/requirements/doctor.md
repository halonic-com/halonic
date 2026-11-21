# agent-host-client.doctor

- Status: active
- Since: unreleased
- Source: HAL-13407; `apps/agent-host/requirements/doctor-route.md`

When the page asks the agent host to check this computer, the doctor stand-in shall send `POST /v1/doctor` with the workspace folder when one is given, and an empty body otherwise, and shall return the host's lines and counts. It shall check each line's `check`, `status` and `actions` against the engine's lists, and throw an error with the host's status and kind for a refusal, such as 429 `busy`, or `answer_invalid` for an answer of another shape.

## Examples

- Given a workspace folder,
  when the page asks,
  then the host gets `{"workspace"}` and the page gets the lines with their actions.
- Given no folder,
  then the host gets `{}`.
- Given the host answers 429 `busy`,
  then the error has status 429 and kind `busy`.
- Given a line whose action the engine doesn't know,
  then the error's kind is `answer_invalid`.
