# Decision: `halonic serve` follow-ups from the #2569 review

- Task: HAL-9026
- Approval: Liam's review of #2569 and #2600 on HAL-9026
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:2g2BjBYVKw12skI4rq6TMeibEFBOApJjnEuH7MlbPWG/JUTRDxkLBuZGHDZ6714/IcDATdOP3hpSbE9HHrJCAQ==

## What changes

`cli.commands.serve.serve` gets two more checked sentences and two sharper ones. `--network`
without a sign-in password now says it exits 2. A served workspace edited after trust is also
refused on `POST /api/runs` with 403 `workspace_not_trusted`, not only on `GET /api/trust`.
A run whose agent needs the sandbox when it can't start is refused with "That run didn't
start. The server is still running." and the server keeps serving.

## Why

The #2569 review found these behaviours in the code but not in the requirement, so a later
change could drop them unnoticed. The requirement now says what the code does and the tests
check.

## Tests

No test was weakened or skipped.

## Covers

- cli.commands.serve.serve
