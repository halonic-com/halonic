# workspace.rule-files

- Status: active
- Since: unreleased
- Source: HAL-18668 (S11b, follow-up of S11 HAL-18500, on the PR watcher's critical path HAL-17974)

When `loadWorkspace` loads a workspace, the workspace package shall read every rule file a workflow's `rule` step names, at its `rule` path inside the workflow's hub (`hubs/<hub>/`, or the workspace root for a root workflow), together with the other files. When `definitionsOf` and `runDefinitionsOf` build a hub's definitions, they shall hold the text of each rule file the hub's workflows name in `rules`, by its `rule` path, so a run keeps those exact bytes and a later change to the file doesn't touch it. A hub whose workflows have no rule step shall get definitions without `rules`, so its `definitionsVersion` doesn't change.

When a rule step names a file the workspace doesn't have, the loader shall report the error `rule-file-missing` at the step's `rule` key, naming the path, and leave the file out of `rules`, so a run fails at that step with `rule.missing`. When the file is over 256 KB (`maxRuleFileBytes`; the isolate has no limit of its own on code), the loader shall report `rule-file-too-large` the same way and leave it out too.

## Examples

- Given hub `acme` with a workflow whose step has `type: rule` and `rule: rules/match.rule.js`, and the file `hubs/acme/rules/match.rule.js`,
  when a run of that workflow in `acme` starts,
  then its definitions hold `rules: { "rules/match.rule.js": <the file's text> }`.
- Given the same workflow without the file,
  when the workspace loads,
  then it has a `rule-file-missing` error that names `rules/match.rule.js`, and the run's definitions have no `rules`.
- Given a rule file of 256 KB and one byte,
  when the workspace loads,
  then it has a `rule-file-too-large` error, and the run's definitions leave the file out.
- Given a hub with no rule steps,
  when its definitions are built,
  then they have no `rules`, and `definitionsVersion` is the one the hub had before rule files were read.
