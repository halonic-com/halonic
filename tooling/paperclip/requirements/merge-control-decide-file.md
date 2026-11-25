# paperclip.merge-control-decide-file

- Status: active
- Since: unreleased
- Source: HAL-18337, step 4 of the plan for the live Merger and the shadow (board, HAL-10, 25 Nov 08:53 UTC; plan on HAL-17912): one set of merge rules, which the Merger loads from the plugin

When `build:plugin` runs, the plugin build shall also write `dist/merge-control-decide-<version>.js`, one ES module with every module it uses bundled in and no import of a Node module, whose `decidePass` takes one pass's snapshot, state, settings that differ from the defaults, and time as plain JSON, and returns `decide`'s actions, new state and log with `rules` set to `halonic.agent-tools@<version>` and `format` set to 1.

If the time can't be read, the state has another version, the snapshot lacks one of its lists or a setting has an unknown name, then `decidePass` shall throw an error that names it instead of deciding.

## Examples

- Given the bundled file,
  when its text is read,
  then it has no import or `require`, and no call of `fetch`, `Date.now`, `new Date()`, `Math.random` or `process`.
- Given a module behind `decide` that imports `node:fs`,
  when the file is built,
  then the build fails.
- Given a snapshot and state passed through JSON,
  when the loaded file's `decidePass` runs,
  then its actions, state and log equal those of `decide` with the same input, and `rules` names the manifest's version.
- Given the settings `fastTrackLabeller` (misspelt) or a time `soon`,
  when `decidePass` runs,
  then it throws and decides nothing.
