# Decision: the trust check requirement names a program's resolved path and env entries

- Task: HAL-11339
- Approval: HAL-11243 (Liam's decision on PR 3213: show them, as `docs/security/trust.md` promises)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:KSfLKVDfVGW/zE7zkuvifo92RWZJbo63VvSPb4mFxKDZsVJ4f6xXqhwm1WVH9ThF6SHtB2jEGIH9eqq53YHrBQ==

The trust check already shows, under each program's row, the path its command resolves to and
the program's own `env` entries (PR 3213). The `cli.trust-check` requirement said nothing about
either, so a later change could drop them and the requirement would still read as met. It now
says so in one sentence, and has a matching example.

No test is weakened or removed; the requirement only gains a promise the existing test already
checks.

## Why

`docs/security/trust.md` tells the person that the check shows the resolved path of a program
and its environment. The requirement is what keeps that promise from being lost.

## Covers

- cli.trust-check
