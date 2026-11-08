# parity.record-only-from-reference

- Status: active
- Since: 0.1.0
- Source: HAL-108

If the old repo's clone is not at the reference commit `784f78d`, has changed tracked files, or has no installed dependencies, then the recorder shall refuse to record and say why.

The recorder shall run the old code with an empty home folder, UTC and a plain locale, and pass on only the variables needed to find Node, so no settings or secrets of the person recording are read.

## Examples

- Given a clone at another commit, when recording starts, then it stops with "not at the reference 784f78d".
- Given a clone at `784f78d` with an edited tracked file, when recording starts, then it stops with "changed files".
- Given a clean clone at `784f78d` without `node_modules/.bin/tsx`, when recording starts, then it stops and asks for `pnpm install`.
- Given a secret in the environment of the person recording, when the old code runs, then its environment holds only HOME, TZ, LANG, NO_COLOR, PATH and LD_LIBRARY_PATH.
