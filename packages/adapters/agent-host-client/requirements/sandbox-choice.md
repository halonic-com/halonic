# agent-host-client.sandbox-choice

- Status: active
- Since: 0.1.0
- Source: HAL-10796; `apps/agent-host/requirements/sandbox-choice-routes.md`

The sandbox choice stand-in shall read the `SandboxChoice` the host answers with `GET /v1/sandbox/choice`, and shall ask the host to choose again with `POST /v1/sandbox/choice/settings-changed` and an empty body, never sending a setting. It shall check each answer against the engine's closed lists of backends, states, reasons and limits, and throw an error with the host's status and kind for a refusal, or `answer_invalid` for an answer of another shape.

## Examples

- Given a host that answers a choice with `active: null` and a `check-failed` backend,
  when the page asks for the choice,
  then it gets that choice unchanged.
- Given a host that answers a backend in the state `fine`,
  when the page asks for the choice,
  then it throws `answer_invalid`.
- Given a host that answers 500 `sandbox_choice_failed`,
  when the page asks for the choice,
  then it throws that status and kind.
