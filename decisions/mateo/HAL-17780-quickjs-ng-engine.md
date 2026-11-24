# Decision: the ToolScript isolate runs our own QuickJS-ng build, checked byte for byte in CI

- Approval: Paperclip task HAL-17780 (plan approved by Liam with conditions, 24 Nov)
- Kind: user-visible

The QuickJS adapter (`packages/adapters/toolscript-quickjs`) stops loading the engine from the
npm package `@jitl/quickjs-ng-wasmfile-release-sync`, which carries quickjs-ng 0.12.1 and has had
no release since February. It now runs quickjs-ng 0.18.0, built from the release, the wrapper's
MIT `c/interface.c` and the emsdk 5.0.1 image, all pinned by sha256 in the adapter's
`engine/SOURCES.json`. `quickjs-emscripten-core` stays at 0.32.0 as the JavaScript API. The build
gives every run a WebAssembly memory of a fixed size that can't grow.

- **`.github/`:** a new `toolscript-engine` job in `ci.yml` (named "ToolScript engine is its
  build") runs `engine/rebuild.sh` twice and fails if the two builds or the committed
  `src/generated/engine/` differ by a single byte. It runs on `ubuntu-24.04` only (never our own
  CI server, since it runs Docker and downloads a third-party release), with
  `permissions: contents: read`, no secrets and no cache. The tarball's sha256 is checked before
  it is unpacked, and the image is pulled by digest and runs without network. The job runs when the
  new `toolscript_engine` area changes (the engine folder, the generated engine, or `ci.yml`), is
  skipped otherwise, and `ci-ok` counts a skip as passing. It uploads its build as the
  `toolscript-engine` artifact, which is where the committed files come from.
- **`tooling/check/`:** `dependencies.json` drops the variant package's entry, and the entry for
  `quickjs-emscripten-core` says which build it now loads. The pins stay in `engine/SOURCES.json`
  and not in `dependencies.json`, as Liam decided on the task.
- **`intrinsics.test.ts`:** the check that both packages are pinned to 0.32.0 now checks that the
  API is pinned to 0.32.0 and that no variant package is left. `engine.test.ts` checks the
  engine's pins.

## Covers

- .github/
- tooling/check/
