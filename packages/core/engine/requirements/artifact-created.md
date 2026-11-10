# engine.artifact-created

- Status: active
- Since: 0.1.0
- Source: [HAL-4247](/HAL/issues/HAL-4247), from the HAL-4215 plan review (HAL-4224, point 3); the old engine's run log in `packages/testing/parity/fixtures/base/run-logs.json`

When the agent of a plain `task` state with `artifact` finishes, the engine shall save the answer as a file: the text of a string answer as it is, and any other answer as JSON indented by two spaces. It shall keep the file's UTF-8 bytes in the blob store before it appends any of the step's events, and shall then log `artifact.created` with the state, the artifact's `name`, and the blob's `hash`, `mediaType` and `size`, right after the answer's `agent.finished` and `context.updated` and before the state's transition. When the blob can't be stored, the engine shall append none of the step's events. When the artifact's `mediaType` isn't `type/subtype` made of HTTP token characters, the engine shall fail the run with an error that names the state, the file and the media type, and save nothing. A state without `artifact` shall save nothing.

## Examples

- Given the base fixture's `notify` state with `artifact: { name: note.md }`,
  when its agent answers `Paid Acme Paper.`,
  then the run log has `artifact.created` with `state: notify`, `name: note.md`, `mediaType: text/markdown`, `size: 16` and the SHA-256 of the answer as `hash`, as the old engine's log has it, and the blob store holds the answer.
- Given a state that saves `fields.json` as `application/json`,
  when its agent answers `{ "vendor": "Acme Paper" }` as an object,
  then the file holds that object as JSON with two-space indents.
- Given a blob store that can't store the file,
  when the agent's answer comes back,
  then the step fails and the run log is as it was before the answer.
- Given a state that saves `note.md` as `text/markdown; charset=utf-8`,
  when its agent answers,
  then the run fails with an error that names the state, `note.md` and the media type.
