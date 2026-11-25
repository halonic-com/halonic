# paperclip.merge-control-decide-file

- Status: active
- Since: unreleased
- Source: HAL-18337 (the hash and the setting types: Liam's review of #6050), HAL-18470 (format 2 for the `reopen` action, and a saved state's missing fields: Liam's review of #6069), step 4 of the plan for the live Merger and the shadow (board, HAL-10, 25 Nov 08:53 UTC; plan on HAL-17912): one set of merge rules, which the Merger loads from the plugin

When `build:plugin` runs, the plugin build shall also write `dist/merge-control-decide-<version>-<hash>.js`, where `<hash>` is the first 8 hex digits of the SHA-256 of the bundle, one ES module with every module it uses bundled in and no import of a Node module, whose `decidePass` takes one pass's snapshot, state, settings that differ from the defaults, and time as plain JSON, and returns `decide`'s actions, new state and log with `rules` set to `halonic.agent-tools@<version>+<hash>` and `format` set to 2. A state that lacks fields added to the state since it was saved shall get them from the empty state.

If the time can't be read, the state has another version, the snapshot lacks one of its lists, or a setting has an unknown name or a type other than its default's (a number, a string, or a list of strings), then `decidePass` shall throw an error that names it instead of deciding.

## Examples

- Given the bundled file,
  when its text is read,
  then it has no import or `require`, and no call of `fetch`, `Date.now`, `new Date()`, `Math.random` or `process`.
- Given a module behind `decide` that imports `node:fs`,
  when the file is built,
  then the build fails.
- Given a snapshot and state passed through JSON,
  when the loaded file's `decidePass` runs,
  then its actions, state and log equal those of `decide` with the same input, and `rules` names the manifest's version and the file's hash.
- Given a state saved before HAL-18470, without `labelNoopReopened`,
  when `decidePass` runs,
  then it decides as with that field empty, instead of throwing.
- Given the same bundle twice, and a bundle with one more line,
  when each is named,
  then the first two get the same name and the third another.
- Given the settings `fastTrackLabeller` (misspelt) or `fillTarget: "15"`, or a time `soon`,
  when `decidePass` runs,
  then it throws and decides nothing.
