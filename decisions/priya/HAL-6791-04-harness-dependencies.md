# Decision: miniflare and the Workers types join the dependency list for the workerd test harness

- Task: HAL-6791 (cloud part 1, the workerd test harness for the port contract suites)
- Approval: Liam approved the harness design and these dependencies on [HAL-6789](/HAL/issues/HAL-6789) (plan section 7); he approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:nvNv7mhB3+AMW9tBmhdIo0QLqxno4wRF3lOdg0q6jYOsQUMQwgWvX8qyhSuafDhT9iifBeXoYmxvKQPUkze/Dg==

## What changes

`tooling/check/dependencies.json` gains two `dev-tooling` entries and widens one:

- `miniflare`, only in `@halonicjs/target-cloudflare-testing`, layer `testing`. It starts `workerd` locally so the contract suites run inside Cloudflare's own runtime.
- `@cloudflare/workers-types`, in `@halonicjs/target-cloudflare-*` and `@halonicjs/adapter-cloudflare-*`. Types only.
- `esbuild` may also be used in `@halonicjs/target-cloudflare-testing`, to bundle a contract suite into the test Worker.

The catalog versions in `pnpm-workspace.yaml` are not part of this pull request. CI reads this list from the base commit, so the entries merge first and the catalog lines come with the runner pull request that installs them.

## Why

Liam's condition 3 on HAL-6789: the harness must provably stay out of the Cloudflare runtime. The new tests show that with the existing rules; no rule changes.

## Tests

No test was weakened or skipped. `src/test/cloudflare-test-harness.test.ts` is new, with five cases: the harness may use miniflare and esbuild; the runtime can't depend on the harness or import it outside tests; the runtime's own tests may use the harness; the runtime can't use miniflare or esbuild; the runtime may use the Workers types as a dev dependency. `src/lib/bundle.test.ts` gains one case: `check:bundle` fails a runtime bundle that contains miniflare, workerd or esbuild.

## Covers

- tooling/check/
