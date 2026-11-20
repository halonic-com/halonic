# format.workflow-artifact-name

- Status: active
- Since: 0.1.0
- Source: HAL-14301, from Nina's C340 check on HAL-14271 (code row C39); the wording is a team decision under HAL-2282

When `parseFile` reads a workflow file, the format shall refuse an artifact name that isn't one file name, at the name: a name with `/` or `\`, an empty name, `.` and `..` say to use a file name without folders, such as `announcement.md`, and any other name follows the rules for a path in an agent's working folder (`format.agent-sandbox-fields`).

## Examples

- Given `artifact: { name: ../../announcement.md }`, when it is parsed, then it fails at `states.<state>.artifact.name` with `artifact name isn't a file name. Use one without folders, such as announcement.md`.
- Given `artifact: { name: notes. }`, when it is parsed, then it fails with `artifact name isn't a file name. Don't end a file name with '.' or a space`.
- Given `artifact: { name: announcement.md }`, when it is parsed, then the name is kept as it is.
