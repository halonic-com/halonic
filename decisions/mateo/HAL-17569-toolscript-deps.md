# Decision: allow the two QuickJS packages for the ToolScript isolate

- Task: HAL-17569
- Approval: Liam approved both dependencies on HAL-17569 (24 Nov, plan review, answer 2: "Dependencies: approved. `quickjs-emscripten-core` and `@jitl/quickjs-ng-wasmfile-release-sync`, both pinned to exactly `0.32.0`, MIT, allowed only for `adapters/toolscript-quickjs`"), and approved this pull request on HAL-17569 on head 978478de328e.
- Kind: internal
- Signature: ed25519:sha256:s6QbTuo7EHJ-9JxW-RnqP0pi0Jq_Jkrdog_YTzYt1lI:4qNiFBaXsF08XEpNDDp4r3BD3WpSh8U1GMG5Qm5YlYsphJMEciGCuDshia15Oug3b/7yIjzbZSq5nQvnb5EsBQ==

## What changes

`tooling/check/dependencies.json` gains `quickjs-emscripten-core` and `@jitl/quickjs-ng-wasmfile-release-sync` (both 0.32.0, MIT) as `outside-world`, allowed only in `@halonicjs/adapter-toolscript-quickjs` (layer `adapters`). No rule of the check changes and no test is changed.

## Why

CI runs the dependency rule with the base commit's list, so the entries land first, on their own. The pull request with the QuickJS isolate (halonic#5742) then adds both packages to the catalog and to the adapter. Any later bump reruns the ToolScript fence suite and goes through Liam's dependency review (Julian's condition 7 on HAL-17650).

## Covers

- tooling/check/
