# Decision: list the coding tools' two process starters in the process-starts guard

- Task: HAL-16853 (for the coding tool server plan, HAL-16737)
- Approval: the coding tool server plan, approved by Liam on HAL-16748; Liam approves this note in review
- Kind: internal

## What changes

`tooling/check/process-starters.json` gets two entries for the in-sandbox coding tool server's
package, `packages/adapters/coding-tools`. CI checks a pull request against the base's list
(`docs/guides/checks.md`), so the entries are reviewed and merged before the code that needs them:

- `src/search/regex-match.ts` imports `node:vm` only to run `search`'s regular expression with a
  time limit, so a pattern that backtracks without end stops instead of blocking the server. It
  runs one fixed script in an empty context, with the expression and lines as data. It loads no
  module, reads no file and starts no process. Its code comes in the coding tools package PR
  (HAL-16752).
- `src/run-tests/start-command.ts` starts the `run_tests` command exactly as the person approved
  it on the approval card, inside the agent's own fence, with `programEnvironment`'s variables
  only, no input and its output only in a log file, never on the server's stdio protocol channel.
  It refuses a command that names a file under a skill's `scripts/` folder, as written or through
  a symbolic link, before anything starts. On Windows it also starts `taskkill` by its full path
  to stop the command's tree. Its code comes in the run_tests PR (HAL-16854).

No requirement, test or golden file changes. The guard warns that the two files don't exist yet.
That is expected until those PRs merge; then the guard checks each entry in full, its
`scriptsTest` included.

## Tests

`src/run-tests/start-command.starts.test.ts` and `src/search/search.test.ts` in the code PRs show
that neither file starts a file under a skill's `scripts/` folder.

## Covers

- tooling/check/
