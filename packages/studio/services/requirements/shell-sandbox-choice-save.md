# services.shell-sandbox-choice-save

- Status: draft
- Since: unreleased
- Source: HAL-14510 (Liam's security review of HAL-13319 on HAL-14121); the shell's side is `apps/studio/src-tauri/requirements/sandbox-choice-save.md`

While the Studio runs in the desktop shell, the agent host transport shall save the person's sandbox choice only through the shell's `agent_host_sandbox_choice_save` command, sending the backend, or `null` to remove the choice, and shall return the host's answer the shell passes back. A refusal from the shell shall reject as `services.agent-host-transport` says, with the shell's kind, and an answer that isn't `{ status, body }` shall reject with `answer_invalid`.

## Examples

- Given a page in the shell,
  when it saves `srt`,
  then the shell's command gets `{ backend: "srt" }` and the page gets the host's answer.
- Given a shell that refuses the backend with `invalid_choice`,
  when the page saves it,
  then the call rejects with status `0` and kind `invalid_choice`.
