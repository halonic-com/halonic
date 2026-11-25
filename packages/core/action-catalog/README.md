# @halonicjs/action-catalog

The reviewed stepper definitions shipped with Halonic: one file per definition under `src/<service>/`, found by
`pnpm discover --fix` without a hand-edited list, each with the SHA-256 of its source. Pure code, no IO. The design is
the steppers architecture note (HAL-17491, sections 1.2, 4.1, 7.8 and 7.9).

- **Layer:** core
- **Owner:** tomas
- **Public API:** `@halonicjs/action-catalog`

The package lands in two steps (`docs/guides/checks.md`): this one holds the discovered list, still empty, and the
`catalog-hashes` check that keeps it up to date. The definitions, their manual guide and the guide for adding one follow
in the next pull request (HAL-17561).

## Example

```ts
shippedKeys; // [] until the first definition, then ["github/upload-social-preview"]
```
