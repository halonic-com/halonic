# Decision: the contract suites wait without `expect`, so their expect count is fixed

- Task: HAL-9336, found on halonic#2664
- Approval: Liam, in review of HAL-9336 (his signature is added there)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ZxqDGy5kqXNSc8dMO6DEPHmr0UAdY83fxQBLX19yDn1VLsBVFuxz2fhSg8Yx1C8/FcqPi4wPgDqM9yPyECw5CA==

## What changes

Seven `vi.waitFor(() => expect(...))` calls in the contract suites of three requirements now wait
with a small helper, `waitUntil`, that makes no `expect` calls, and then check once with `expect`
where the test needs the result. The tests check exactly what they checked before. The `expect`
count of each requirement goes down once, to the lowest number a run could ever have reached,
and then stays the same on every run.

## Why

`vi.waitFor` runs its callback again on every try, so every retry counted as one more `expect`.
The count of `contracts.host-settings-store` was 375 on halonic#2664 against 376 on the merge
base, although that pull request did not touch it. This pull request edits the test files, so the
guard's `vi.waitFor` exception (HAL-6369) does not apply to it: the drop is real, and it is the
last one, because the count can no longer vary with timing.

## Covers

- contracts.host-settings-store
- contracts.llm-provider
- contracts.llm-stream
- contracts.scheduler
