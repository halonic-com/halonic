# Decision: the requirement guard asks for guardian signatures when a pull request changes a trust root

- Approval: HAL-8163, Liam's task; Liam reviews and signs this note
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:KS86vVoY6KiyxkdfkbkZctmt2vxaqbRkWsAvsZwTWqtQjJXIZlyAV1Dwnjq9vWBDk8TYqpaCW6lW1U8C9DfbAg==
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:7NpY31xXTsjsQUTq78/GektkvuVhVorpLtzOQuLJDrK0Pz2AjeU01ZrrdvHOJ6QaCCWzrzUzOk3Zsnb5G4x6Bw==
- Task: HAL-8163

## What changes

- The requirement guard now checks a decision note against the guardians' keys when the pull request
  changes a trust root of the guard, the same rule the note check (`Guard notes`) already uses. Before,
  it checked one signature against the `user-visible` keys, which `approvers.json` pins none of, so no
  note could pass both checks and every change to a trust root was blocked.
- `note-check.ts` exports one rule, `reachesTrustRoot`, and both checks use it, so they can't drift
  apart. A change to `policy.json` in `extraExports` only doesn't reach a trust root, in either check.
- Pull requests that change no trust root are checked as before: one signature for the note's kind.

## Tests

No test was weakened and no golden file changed. Four tests are added in `guard-notes.test.ts`: a
trust-root change passes with a guardian's signature, fails with another key's, a change outside the
trust roots still uses the single-key check, and so does a change to `policy.json` in `extraExports`
only (unless a real trust root changes with it).

## Covers

- tooling/check/
