# studio.src-tauri.crates.tunnel.pairing-codes

- Status: draft
- Since: unreleased
- Source: HAL-12244; tunnel phase B build plan, decisions 2 and 5 (HAL-12232); ADR "Pairing and the end-to-end session"

The phone shall accept a pairing code only in its plain form, 12 symbols of the pairing alphabet, and shall turn it into the Noise psk with HKDF-SHA256 (empty salt, info `halonic pair psk v1`, 32 bytes), so the code itself is never sent. It shall derive the check code from the pairing handshake's hash with HKDF-SHA256 (empty salt, info `halonic pair check v1`, 8 bytes), read as an unsigned 64-bit big-endian number reduced mod 31⁶ and written as 6 symbols, most significant first. Its commitment to pairing message 3 shall be the SHA-256 of `halonic pair commit v1`, its 32-byte static public key and the exact bytes of its message 3 payload. A pairing code shall never appear in the phone's debug output.

## Examples

- Given the pairing codes in `pairing-vectors.json`,
  when the phone derives their psk,
  then each is the vector's psk.
- Given the check-code vectors,
  when the phone derives a check code from the hash or reads it from the HKDF bytes,
  then each is the vector's check code.
- Given `XX7A 9Q36 KFB3`, `xx7a9q36kfb3` or a code with a `0`,
  when the phone reads it,
  then it is not a pairing code.
- Given a pairing code,
  when it is written to a debug line,
  then the line doesn't hold it.
