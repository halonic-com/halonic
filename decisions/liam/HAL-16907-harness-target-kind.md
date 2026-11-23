# Decision: a `harness` target kind for the Node harness wiring

- Approval: Liam chose option B of Owen's plan on HAL-14217 (a target package of its own for the harness wiring); Julian reviews it on HAL-16907, Mateo checks it there because Liam wrote it, and Liam and Julian sign as the two guardians, because `lib/layout.ts` is a trust root
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:cGng8G4vjgwnx8Xu1RnTqbCdDZW3mFbOxX1XENtl2sZ33ThtP2wKBjx9EUn2jhuWdwN3WgXwpfplPQJhVGn+BA==
- Task: HAL-16907

## What changes

- `targetKinds` in `tooling/check/src/lib/layout.ts` gets `harness`, so
  `packages/targets/<t>/harness` is a package place named `@halonicjs/target-<t>-harness`, in the
  targets layer. `pnpm new package targets/node/harness` works because the generator reads the
  same list.
- The layer table (`rules/layer-table.ts`) gives a harness package the runtime's rules: core, host
  and adapters; never a deploy package or another target package. A deploy package still ships
  only its own target's runtime, not its harness.
- The Node API rule (`rules/layers.ts`) allows `node:*` in a harness only for the Node target,
  as for runtimes.
- Requirement `check.cli-never-uses-deploy-targets` is edited: the CLI may list and import
  `@halonicjs/target-node-harness` as well as `@halonicjs/target-node-runtime`. Two examples are
  added. No example is removed, and the rule for every other target package is unchanged.
- Tests are added in `src/test/targets.test.ts` and `src/lib/layout.test.ts`; none is removed or
  weakened. Existing tests match the reworded messages unchanged.
- `docs/guides/checks.md` and `CONTRIBUTING.md` name the new kind. `AGENTS.md` follows in the
  maintainer's own pull request.

Nothing on `main` breaks: no `harness` package exists yet.

## Why

About 890 lines of the CLI's harness wiring (`local-harness-host.ts`, `local-proposals.ts`,
`cli-provider-keys.ts` and what they pull in) must be shared by the CLI and
`halonic-agent-host --engine`. They use Node, the host and about ten adapters, so only the
targets layer can hold them. Putting them into `targets/node/runtime` would give the listener
behind `halonic serve` a dozen dependencies and a public interface that have nothing to do with
it. A package of its own keeps one purpose per package, and the CLI still ships only Node
packages, so the board's rule on HAL-7114 (users install only the targets they use) holds.

## Covers

- check.cli-never-uses-deploy-targets
- tooling/check/
