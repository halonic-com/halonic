# Decision: halonic-tunnel wipes its secrets with zeroize

- Approval: Paperclip task HAL-12519, where Liam is asked to approve the dependency; Julian reviews this PR as the security reviewer (HAL-12487)
- Kind: internal

The phone's private key, the pairing code and the psk taken from it stayed in memory after use.
Julian's security review on HAL-12485 asked for them to be wiped when dropped. `zeroize` does
exactly that, with volatile writes the compiler can't remove. It is already in `Cargo.lock`, at
1.9.1 with its derive macros (`zeroize_derive` 1.5.0), through other crates, so pinning `=1.9.1`
with the `derive` feature adds no crate to the app: only the tunnel's own lock entry gains a line.
`PhoneKeys` and `PairingCode` derive `ZeroizeOnDrop` only, not `Zeroize`, so no caller can wipe a
key and keep using it. `PhoneKeys` is no longer `Clone`, so there is one copy to wipe.

Writing our own wipe was the other choice: about 20 lines of volatile writes and a compiler fence
that we would own and audit, for no gain.

## Covers

- apps/studio/src-tauri/crates/tunnel/Cargo.toml
