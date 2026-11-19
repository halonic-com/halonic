# Decision: the tauri job builds the host's Noise session to WebAssembly

- Approval: Paperclip task HAL-12236 (B1), with Julian's signature on HAL-12355 and Mateo's build answer on HAL-12356; Julian and Liam review this note
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:PuGe4E9lShSAyEukphrNKRw/MSjeamhodcF//T56kjlX73eoZlRbUsmNZCk2A/ScS4e8zzbiNQPb9HIvcZR7BQ==

The agent host's Noise session is `snow` built to WebAssembly, from the new crate `apps/studio/src-tauri/crates/e2e-noise-wasm`. The `tauri` job now adds the `wasm32-unknown-unknown` target, runs clippy for it (the crate's exports only compile there), builds the `.wasm` with the crate's reproducible `noise-wasm` profile and remapped paths, and uploads it as the `noise-wasm` artifact. Nothing else in the job changes.

The adapter pull request commits that file, and Mateo turns this step into the check that rebuilds it and compares the bytes.

## Covers

- .github/
