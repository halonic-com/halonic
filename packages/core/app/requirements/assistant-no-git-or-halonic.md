# app.assistant-no-git-or-halonic

- Status: active
- Since: 0.1.0
- Source: HAL-65 section F, `workspace.trust.assistant-no-git-or-halonic` (rule A, HAL-3268); agreed on HAL-3362; HAL-3947

If the assistant asks the review service to write a file whose path is inside `.git/` or `.halonic/`, then the review service shall refuse it as not allowed and touch neither the file nor its record, in any mode, trusted or not. It shall compare each part of the path the way Windows and macOS open it, as the `DefinitionStore` port does (case folded, trailing dots and spaces and the code points HFS+ ignores removed), so `.Halonic./x` counts as `.halonic/x`, and a hub's `.halonic/` folder counts too. It shall refuse the same way a path the port calls unsafe or private (`..`, an absolute path, `.env*`, `.envrc`, an NTFS stream, an 8.3 short name such as `GIT~1`) and a path the store refuses, such as one through a symlink. Accepting a run's proposal applies the same check to every file in it.

## Examples

- Given a trusted workspace,
  when the assistant writes `.git/hooks/pre-commit`, `.GIT/hooks/x`, `.git./hooks/x` or `GIT~1/hooks/x`,
  then it is refused as not allowed and nothing is written.
- Given a trusted or an untrusted workspace,
  when the assistant writes `.halonic/review/x.json`, `.halonic/other.json`, `hubs/h/.halonic/x`, `.Halonic./review/x`, `.HALONIC/x` or `hubs/h/.Halonic/x`,
  then it is refused, the file isn't written and no record is made.
- Given a store that refuses `agents/link/a.agent.yaml` because `link` is a symlink,
  when the assistant writes it,
  then it is refused as not allowed rather than failing.
