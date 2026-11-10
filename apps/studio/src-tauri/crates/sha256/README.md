# halonic-sha256

SHA-256 (FIPS 180-4) for the Studio shell, with no dependencies. The shell's trust store names each record file by the SHA-256 of its location, exactly as `FileTrustStore` in `packages/adapters/fs-node` does with Node's `crypto`, so the desktop app and the CLI share one folder of records (HAL-2612). `sha2` is not on the plan's list of approved libraries (plan section 7), so the shell keeps its own.

- `Sha256::new().update(bytes).finish()` hashes bytes given in any number of parts; `sha256(bytes)` hashes them in one call.
- `Digest::to_hex()` gives the 64 lower-case hex characters Node's `digest("hex")` gives.

It is for naming and comparing, not for passwords or signatures. The tests check it against the NIST test vectors.
