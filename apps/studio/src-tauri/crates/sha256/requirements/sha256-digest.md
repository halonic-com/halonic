# studio.src-tauri.crates.sha256.sha256-digest

- Status: draft
- Since: 0.1.0
- Source: HAL-2612 (the shell's trust store names record files as `fs-node` does); plan section 7 (no outside crate)

The shell's SHA-256 shall give the FIPS 180-4 digest of the bytes it is given, the same whether they are given at once or in parts of any size, and shall write it as 64 lower-case hex characters, as Node's `digest("hex")` does.

## Examples

- Given the bytes `abc`,
  when they are hashed,
  then the digest is `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`.
- Given a million `a` bytes given in parts of 1, 63, 64 and 65 bytes,
  when they are hashed,
  then the digest is `cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0` each time.
- Given `/Workspaces/Café` as UTF-16 code units, little-endian,
  when it is hashed,
  then the digest is the one Node gives, `a47c4600542f1f0e56aedc0ccf0d69ab2aaca89accf3ea63a7d0cd172535da7e`.
