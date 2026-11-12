# Decision: a workspace whose files can't be trusted is refused, and the CLI says which file

- Approval: Liam approves this note when he signs it, after Priya's review of this pull request on
  [HAL-5435](/HAL/issues/HAL-5435), for [HAL-5421](/HAL/issues/HAL-5421), a follow-up of the code
  review on [HAL-5196](/HAL/issues/HAL-5196)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:4GZchexN6r3C12RgDbg3HTzzsHM+uuj6TtCImLkc+lKn2TfT7O+5i2zwGsLVSAyp38Vfrz75MV0roCDtjiGKDQ==

## What changes

`app.trust-service` gives a `refused` check, with the id and reason of each refused connector or
provider and without a fingerprint, a grant or the address, when the trust content refuses
something, whatever the trust record says. A record whose content lists refused entries is never
shrunk. `cli.commands.trust.review-and-trust` makes `halonic trust`, and every command that needs
trust such as `halonic run`, stop with exit 2 and name each refused file. `app.doctor-workspace`
shows such a workspace as a warning.

## Why

Before, `trustFingerprint` threw a RangeError and the CLI showed an unexplained internal error
(exit 1). It failed closed, but nobody could tell which file to fix. Exit 2 (`invalid_input`)
rather than 3, because trusting again can't fix a wrong file.

## What doesn't change

Nothing that was refused before starts now: a refused check has no fingerprint, so no record can
match it, and `grant` still throws for it. No test is skipped or weakened: tests are added, and
tests that grant from a check now narrow it first.

## Covers

- app.trust-service
- app.doctor-workspace
- cli.commands.trust.review-and-trust
