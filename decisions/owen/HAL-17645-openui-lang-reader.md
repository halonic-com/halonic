# Decision: a new core package for the OpenUI Lang reader

- Approval: Liam approved the new package on HAL-17645 (OpenUI A1: "a new core package made with `pnpm new package core/openui-lang`", Liam approves the new package there), from the OpenUI plan the board approved on HAL-17107. It changes `tooling/check/policy.json`, a trust root, so both guardians sign: Julian, then Liam
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:T/A4fyPC6aMNux373e7RSNDVjYNyBJClms1dr7c0LNdkn7jKfRd3kem84wYeM8SbnK2AlqAVN23omiaVmHbuCg==
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:vfLtZ4K7XplyBOx4fC/jtmmAfbLqtUBzWuO0qA3fD8CjwRlrqRIYfJs1T4IB5Swt562iRntNDlBpyzAUMLHvCg==

## What changes

A new core package, `@halonicjs/openui-lang`, reads the display part of OpenUI Lang 1.1 into a
checked component tree. `pnpm new package` added `@halonicjs/openui-lang` at the end of
`coreOrder` in `tooling/check/policy.json`. The package depends on no other core package, so its
place in the order doesn't matter yet. Nothing else in the guard changes.

## Tests

No test is weakened. The package's own tests run the spec's 58 conformance cases and the reader's
limits under the new requirement `openui-lang.reader`.

## Covers

- tooling/check/
