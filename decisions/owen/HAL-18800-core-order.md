# Decision: retry-detectors comes right after ports in coreOrder

- Approval: Paperclip task HAL-18801 (Liam's approval of the HAL-18800 plan, point a); Liam approves this note in review
- Kind: user-visible

The engine is to run a writer step under the early hedge from `@halonicjs/retry-detectors` (HAL-18800). A core package may use only core packages listed before it in `coreOrder`, and `retry-detectors` was listed last, after `@halonicjs/engine`. It moves to right after `@halonicjs/ports`.

- `retry-detectors` depends on nothing in core: its `package.json` lists only dev tooling. That is the condition of the approval. If it ever needs `events` or `engine`, the hedge moves into the engine instead, and the package doesn't move again.
- The list stays free of cycles, and no other package changes place.
- CI reads `coreOrder` from the base commit, so this lands on its own, before the pull request in which the engine starts to use the package.

## Covers

- tooling/check/
