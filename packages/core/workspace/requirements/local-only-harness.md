# workspace.local-only-harness

- Status: active
- Since: 0.1.0
- Source: HAL-6125 (HAL-5922, ADR `docs/adr/2026-11-08-local-first.md`)

When `loadWorkspace` has parsed a workspace whose `workspace.yaml` sets `privacy.localOnly: true`, the workspace package shall report as an error, at the agent file's `harness` key with its line, every agent whose `harness` names a program (`claude-code` or `codex`), because such a program sends the work to its own cloud model. The message names the agent and its harness, and ends with how to turn local-only off: `privacy.localOnly: false` in `workspace.yaml`. An agent without `harness`, or with `harness: halonic` (Halonic's own loop), gets no such error, and a workspace without `privacy.localOnly: true` gets none.

## Examples

- Given `privacy.localOnly: true` and the agent `writer` with `harness: claude-code`, when it is loaded, then `agents/writer.agent.yaml` has the error `Agent "writer" runs in claude-code, which sends its work to its own cloud model, and the workspace is local only: remove harness to run it in Halonic's own loop, or set privacy.localOnly: false in workspace.yaml` at `harness`.
- Given the same workspace with an agent with `harness: halonic`, when it is loaded, then that agent's file has no error.
- Given `privacy.localOnly: false` and the agent `writer` with `harness: claude-code`, when it is loaded, then it has no errors.
