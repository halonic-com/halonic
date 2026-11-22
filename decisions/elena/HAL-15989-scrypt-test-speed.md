# Decision: the scrypt tests run noble's scrypt in a worker thread without coverage

- Task: HAL-15989, from the board's CI check (merge-base tests of #4957)
- Approval: the task asks for this change (HAL-15989, https://paperclip.halonic.com/HAL/issues/HAL-15989); Liam approves and signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:X79dAV0oFaTKl85SZ5vfGbglTxNirL/EdG8hGHS1XUshsmmGpMz6/gsNWhDy2OX7PEewY6IabKLJW/ZJf8k0Cg==

## What changes

- `contract.test.ts` and `refusal.test.ts` mock `@noble/hashes/scrypt.js` so that `scryptAsync`
  is noble's own `scryptAsync`, run in a `worker_threads` worker (`src/test/scrypt-in-worker.spec.ts`).
  `refusal.test.ts` already wrapped it to count calls; it still does.
- The package's test and hook timeout goes from 180 s to 60 s.

## Why

On #4957's merge-base run, "verifies a new hash with the password, and only with it" (one hash
and two checks at ln=14, r=8, p=5) timed out at 180 s, and the package took 608 s. Vitest's V8
coverage counts every block in the thread it measures, scrypt's inner loop included: one hash
takes 0.19 s without it and 2.4 s with it on a free core, and a loaded 4-CPU runner stretched that
to about a minute. A worker thread has its own V8 isolate that coverage doesn't measure, so scrypt
runs at full speed there. Locally the package's tests went from 26 s to 2.5 s.

## Tests

No test or assertion is removed or weakened, and no requirement changes:

- The hasher's own code still runs in the measured thread (coverage stays at 100%), with the
  production settings: the contract's `newHash` pattern still pins ln=14, r=8, p=5.
- The key still comes from the real noble library; only the thread changes. With the worker
  returning a wrong key, 9 of the 17 tests fail.
- `no-work-before-refusal` still counts the calls to `scryptAsync`, and `matches-openssl` still
  compares each vector with Node's `scryptSync`.

## Covers

- password-scrypt.matches-openssl
- password-scrypt.no-work-before-refusal
- contracts.password-hasher
- ports.password-hash-format
