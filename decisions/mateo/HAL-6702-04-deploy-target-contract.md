# Decision: every deploy target passes the deploy-target contract suite, now that it exists

- Approval: Liam's first review note on PR 02 (halonic#3967, HAL-6702) asks for the suite and the fake target; the build plan was approved by Liam on HAL-13512; Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:9qq4SB1nMR1A4EjvjbRP6QGrMgLCanOMqi2KuF0XAHNQj8Hu0U/5L8n7QDqsSQxrZjcQOi/iGY+UsTFfsoS9BA==

## What changes

- `@halonicjs/testing-contracts` gets the `contracts.deploy-target` suite and a `FakeDeployTarget` that passes it. The fake can hold the lock, fail a self-test and add warnings after the switch, so the command's tests can use it.
- Requirement `ports.deploy-target` drops its last words, "once the fake target exists". The rule itself is unchanged: every target shall pass the `contracts.deploy-target` suite. Those words only said the suite wasn't there yet.

## Why

PR 02 put the port on `main` before any suite could check a target against it, so the requirement said when the rule would start. This PR adds the suite and a target that passes it, so the rule now holds as written and the waiting clause is out of date.

## Tests

22 tests run the suite against the fake target, and `fake-deploy-target.ts` has full coverage. The Cloudflare target gets its `deployTarget` export, and runs the suite, in a later step of HAL-6702.

## Covers

- ports.deploy-target
