# agent-host-client.sandbox-choice-save

- Status: draft
- Since: unreleased
- Source: HAL-14510 (Liam's security review of HAL-13319 on HAL-14121); continues `agent-host-client.sandbox-choice`; the shell's side is `apps/studio/src-tauri/requirements/sandbox-choice-save.md`

When the page saves a sandbox choice, the sandbox choice stand-in shall pass the backend, or `null` to remove the choice, to the shell's save call it was given, never to the host, and shall read the answer the shell passes back as it reads `POST /v1/sandbox/choice/settings-changed`. It shall throw the shell's refusal unchanged, the host's status and kind for the host's refusal, and `answer_invalid` for an answer of another shape.

## Examples

- Given a shell that saves `srt` and passes back a choice with `active: "srt"`,
  when the page saves `srt`,
  then it gets that choice and the host got no call from the stand-in.
- Given a shell that refuses the backend with `invalid_choice`,
  when the page saves it,
  then it throws that kind.
