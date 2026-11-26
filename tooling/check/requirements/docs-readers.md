# check.docs-readers

- Status: active
- Since: unreleased
- Source: HAL-19264

When `pnpm check` runs, `docs-readers` shall fail on a test file that reads a doc under `docs/` by a path out of its package (after `../` or joined to `findRepoRoot()`) while `docsReaders` in `tooling/check/src/lib/affected-tests.ts` doesn't list that test's package for the doc, on an entry naming a package none of whose tests read the doc, and on an entry for a doc that doesn't exist.

## Examples

- Given `apps/cli/src/runbook.test.ts` reading `../../../docs/guides/runbook.md` and no `docsReaders` entry for that doc, then the check fails at that line and names the package to add.
- Given the same test with `"docs/guides/runbook.md": ["acme"]` in `docsReaders`, then the check passes.
- Given an entry naming a second package whose tests don't read the doc, then the check fails and names the package to remove.
- Given an entry for a doc that doesn't exist, then the check fails and asks to remove the entry.
