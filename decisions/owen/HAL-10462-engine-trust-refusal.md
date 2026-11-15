# Decision: `trust` refuses a pin that is not in `sha256:` form

- Task: Paperclip task HAL-10462
- Approval: Liam approved the code of PR #2990 on HAL-10472
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:JBPSwRBpGL4gPdm4y+WjN58l74F2bk12QXidmhUTJMsa8tiqHdf2CoLJjbBuTjrtYX8s5BeEwgKyAcvzM62nBg==

The engine now refuses a harness start when the instruction trust check asks, and it only checks: it never trusts. To keep that check meaningful, `trust` no longer records a damaged pin.

- `trust` refuses a pin that is not in `sha256:` form, with an example of the right form in the message.
- Nothing that was accepted before and is valid is refused; only a damaged pin is.
- The change is stricter, and no test was weakened.

## Tests

- `packages/core/app/src/workspace-files.test.ts`
- `packages/core/engine/src/harness/run-harness-call-instruction-trust.test.ts`

## Covers

- app.instruction-trust-service
