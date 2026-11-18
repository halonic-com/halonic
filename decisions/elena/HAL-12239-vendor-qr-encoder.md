# Decision: vendor Nayuki's QR encoder into the kit

- Task: HAL-12239
- Approval: Liam approved it in decision 15 of the phase B build plan on HAL-12232 (https://paperclip.halonic.com/HAL/issues/HAL-12232#document-plan): "The QR encoder is vendored, reviewed source." Julian reviews the source and the licence entries against upstream on HAL-12263.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:onN2M+JKBFXBq7ETFMRZBxX9+FcoVU0FrSiit2e6ZeZUQvyX4NC2tYtS5Nn5MyX41Lb1gEIwI25vjW0U20dpAw==

## What changes

`tooling/check/licences.json` lists the three vendored files in `packages/studio/kit/src/qr/` (`codewords.ts`, `penalty.ts`, `qr-code.ts`, all MIT, from Project Nayuki's QR Code generator at commit `bcfe1b018cec5f1f91b5705eca5bb4cdd34e9f8d`), and `tooling/check/licence-texts/MIT.txt` holds the licence text with Nayuki's copyright line for the release notices. No rule of the check changes and no test is changed.

## Why

Decision 15 picks a vendored, reviewed encoder over writing our own (Reed-Solomon, format bits, mask scoring) or adding a package. `check.licences-vendored` requires each copied file with a third-party licence to be listed and its licence text to be stored; the files carry `SPDX-License-Identifier: MIT` so the check finds them. `MIT.txt` carries Nayuki's copyright line, because the notices print one text per licence: a second MIT file from another author would need a per-file text, which is a change to the check for when that happens. `jsqr`, which the tests use to decode the encoder's output, is allowed by the note `decisions/elena/HAL-12239-01-approve-jsqr.md` in the pull request before this one.

## Covers

- tooling/check/
