# Decision: the pairing codes get shared test vectors

- Approval: Paperclip task HAL-12235, from the tunnel phase B build plan on HAL-12232 (decisions 2, 5 and 14); Liam wrote it, Julian reviews and signs this note as the security reviewer
- Kind: internal

The pairing code, the check code and the QR payload are written by the host and read by the
phone, whose side is Rust. Both must give the same bytes, so the cases live in one file,
`packages/core/ports/src/golden/pairing-vectors.json`, that both test suites read. The psk and the
check code in it come from HKDF-SHA256 in the test, not from the codec, so the file checks the
codec rather than repeating it. Keeping the file under `golden/` means any later change to a case
needs a note like this one, because a changed case would break the phone.

## Covers

- packages/core/ports/src/golden/pairing-vectors.json
