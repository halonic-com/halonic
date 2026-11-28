# Decision: a target may name a text body field, for the "Create a repository" stepper

- Approval: Liam's plan approval with conditions on HAL-21185 (condition 3), for task HAL-17563
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:6IsR+Wwu37G/uTxznbvSpmOfqk2UEFN7/uZlGZ+r0pkmN0g9csruWc/sKEwMTtq2i8My+6jmO2L1fnJ+s+X8BA==

## What changes

- An `irreversible` call's target may now name a text body field as well as a path placeholder, in `routesOf` (`core/action-steppers`, `call-target.ts`) and in the shell (`action-send`'s `target.rs`, `routes.rs`, `send.rs`). The shell fills such a part with the value the page sent, after that field's pattern and hidden-character checks, the same checks a placeholder passes. A constant, number, list or secret field can never be part of a target.
- Requirement `action-steppers.call-target` now says "each one of the route's own placeholders or text body fields". The action-send requirement and README say the same, with an example.
- `call-target.test.ts` expects the new error wording ("isn't one of the route's placeholders or text body fields") for the same refused targets, and adds a test for a body field. The `action-send` route fixture gains `acme.create-repo`, so `tests/routes.rs` counts 7 calls instead of 6, and the guided route moves from index 6 to 7. `keys.test.ts` lists the two new definitions.

## Why

`github.create-repository@1` creates a repository with `POST /orgs/{owner}/repos`, where the new repository's name is in the body, not the path. Without this change, the user would type only the organisation (`acme`) to confirm creating `acme/new-app`. Liam's condition 3 asks that the dialog show `{owner}/{repo}`.

## Tests

No test was skipped or weakened. Every target refused before is still refused. New tests cover a text body field in a target being taken, and a constant, integer or secret field being refused, in both TypeScript and Rust. In the shell, typing `acme` or `acme/other` for `acme/new-app` sends nothing.

## Covers

- action-steppers.call-target
- packages/core/action-steppers/src/call-target.test.ts
- packages/core/action-catalog/src/keys.test.ts
