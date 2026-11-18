# Decision: CI checks that the committed noise.wasm is its build, and that the notices list its crates

- Approval: Paperclip task HAL-12236 (B1), Julian's condition 7 on HAL-12355 and his review on HAL-12450; Julian and Liam review this note
- Kind: internal

The adapter `packages/adapters/e2e-noise` commits `src/noise.wasm`, the build of the crate `apps/studio/src-tauri/crates/e2e-noise-wasm` that the note for #3578 (`decisions/owen/HAL-12236-e2e-noise.md`) added to the `tauri` job. This pull request changes `ci.yml` in three places, and nothing else in it:

- **The committed file must be the build (HAL-12451).** After the `noise-wasm` artifact is uploaded, a new step compares the committed `noise.wasm` with the build byte for byte and fails if they differ, naming both sha256 sums. The artifact is uploaded first, so the author can commit the right file without Rust.
- **The area filters.** The `tauri` area also runs on a changed `noise.wasm`, so a new `.wasm` without a crate change is checked too. The `agent_host` area includes the adapter.
- **The notices.** A new step fails if a crate that only the WebAssembly build pulls in is missing from `THIRD-PARTY-NOTICES.txt`. The notices aren't built for the `wasm32-unknown-unknown` target, because that would also list the shell's browser crates, which no file we ship contains.

## Covers

- .github/
