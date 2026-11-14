# Decision: a package that runs in workerd gets its coverage from workerd

- Approval: Paperclip task HAL-7728 (Liam, from the team check on HAL-9140)
- Kind: user-visible

Node's coverage can't see code running in `workerd`, so the adapters with `"runtime": "workers"`
showed 0% against their 80% floor and each carried a stand-in Node test. `tooling/config`'s
Vitest preset now gives such a package a coverage provider that adds what workerd counted: the
workerd harness starts V8 coverage inside the Worker, takes it back to the source files and leaves
it for the provider, which adds it to the Node run's report. Nothing about a package's floor
changes, and no package without `"runtime": "workers"` is affected. `tooling/config/vitest.config.ts`
leaves the provider file out of its own coverage, since a nested Vitest run proves it and this run
can't see inside that. No test or requirement is removed or weakened.

## Covers

- tooling/config/src/vitest-preset.ts
- tooling/config/vitest.config.ts
