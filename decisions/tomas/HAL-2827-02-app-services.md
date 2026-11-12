# Decision: the listed-tool API is its own entry point of @halonicjs/app

- Approval: Liam asked for this split in his review of halonic#2181 on HAL-7396, a team decision with no board card; the package owner (Liam) approves this note in that review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:mUYVPfRV9GJc3JfSEnsCS2GhS/8yLR9LDT+XWGKG+BDIzSw4VFtDgrAy60Vk5f/nRAWLLeIIxaw0xzM8+8FVDw==

`tooling/check/policy.json` lists one new entry under `extraExports`:
`@halonicjs/app` gets `./listed-tools`. Nothing else in `policy.json` changes.

The new entry point, `packages/core/app/src/listed-tools.ts`, exports what the main one exported
for the tools a server lists: reading a listed tool, its fingerprint and rules, approving and
reviewing it, and checking a connector's tools. The main entry point no longer exports them. The
two engine files that used them import them from `@halonicjs/app/listed-tools`.

## Why

With halonic#2181's new exports, `packages/core/app/src/index.ts` reached 513 lines, over the
500-line file limit. A barrel that `index.ts` re-exports saves no lines, because Biome's
`noReExportAll` forbids `export *` and listing the names again takes the same lines. A second
entry point splits the API by concept, as `@halonicjs/format/integration` does, and needs no lint
rule turned off and no higher limit.

## Covers

- tooling/check/policy.json
