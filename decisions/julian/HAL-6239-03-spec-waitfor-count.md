# Decision: count only the passing vi.waitFor attempt's expect calls

- Approval: HAL-6239, with the decision of HAL-3434 and the guarded trust roots of HAL-1337
- Kind: user-visible

`verifies()` in the spec package now takes the `expect` calls of a failed `vi.waitFor` attempt off the count again, so a test's recorded count no longer depends on how often it retried on a slow runner. This is the planned fix named in `docs/guides/checks.md`. It changes the spec package, which is one of the guard's own paths. A follow-up pull request removes the guard's temporary `vi.waitFor` exception (HAL-6369).

## Covers

- packages/testing/spec/
