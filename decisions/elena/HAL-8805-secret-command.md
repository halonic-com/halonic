# Decision: the secret service tells a command up front what a name needs

- Task: HAL-8805, the `halonic secret` command (#2542), reviewed on HAL-8824
- Approval: Liam approves this note in review on HAL-8824 and signs it as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:quJEmwJCBjlJFR8qXeafRnT8ochZpFLzRvmYHCv2Um0Vu+gBxD57ZUN1iCKHt1WahR84AMKsYrg6ZK+mo+wPBQ==

## What changes

- `app.secret-service`: one sentence is added to the requirement. The service now tells a command,
  before any value is typed, whether a name is refused or needs its value typed twice. The CLI
  needs this to decide whether to prompt once or twice, and to refuse a protected name before it
  asks for a secret. The rules for what may be set, removed or listed are unchanged, and so is the
  rule that no reason or error repeats a value.

## Why

`halonic secret set` reads the value from a hidden prompt. Asking for a value and only then
refusing the name would make a person type a secret for nothing, and typing it into a prompt that
the command was about to reject is a needless exposure. The check therefore has to come first, and
it belongs in the service so every caller gets the same answer.

## Tests

No test was weakened or skipped. `secret-service.test.ts` gains a case for the new sentence.

## Covers

- app.secret-service
