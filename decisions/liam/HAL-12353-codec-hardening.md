# Decision: a typed code is checked as ASCII before it is uppercased

- Approval: Paperclip task HAL-12353, a follow-up from Julian's review of the pairing codecs on HAL-12276, under the HAL-12235 note `decisions/liam/HAL-12235-pairing-codecs.md`; Liam wrote it, Julian reviews and signs this note as the security reviewer
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:uUbtzDTyJVt1V56ECYcoCuVMOEeSLOZvxPjwXODiugDubfqhUOgJwDdM8FbfNPOMCWSHgyhyUWmGT/Siz0dxDg==

Two hardening changes to the pairing codecs. Nothing a user sees changes: the codes, the way they
are shown and the QR payload stay the same, and a code typed with ordinary letters, digits and separators reads as before.

- `ports.pairing-codes`, reading: a typed code drops its separators, then is refused if anything
  left isn't printable ASCII, and only then is uppercased. Before, the whole text was uppercased
  first, so `ſ` (long s) became `S` and a no-break space counted as a space. The separators are
  now exact: ASCII whitespace as Rust's `is_ascii_whitespace` has it, dots, dashes and the middle
  dot, so the phone's parser (D3) can follow the same rule.
- `ports.pairing-codes`, making: `newPairingCode` draws at most 8 times 16 bytes and then fails,
  instead of looping without a bound on a broken source. A good source runs out with a chance far
  under 2⁻¹⁰⁰.
- `pairing-vectors.json` gets `typedCodes`: typed texts and the code each reads as, or `null` when
  it is refused. The phone's tests read the same cases.

## Covers

- ports.pairing-codes
- packages/core/ports/src/golden/pairing-vectors.json
