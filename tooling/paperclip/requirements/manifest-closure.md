# paperclip.manifest-closure

- Status: active
- Since: unreleased
- Source: HAL-19469; follow-up to `paperclip.manifest-julian` (HAL-19440) from the second reviewer's review of it: modules further down the manifests' imports shape the built manifest too

`manifestFileOf` shall name every repo file esbuild bundles into a plugin manifest, as `build:plugin` builds `tooling/paperclip/src/plugin/manifest.ts` and `tooling/paperclip/src/seats/plugin/manifest.ts` (the whole runtime import closure, tests and `import type` excluded, packages from `node_modules` aside), and the build files that bundle them (`tooling/paperclip/package.json`, `src/plugin/build.ts`, `src/plugin/build-options.ts`, `src/seats/plugin/build.ts`); a check shall fail naming each module the closure holds that `manifestFileOf` misses, and each `manifestImports` entry that is neither in a closure nor a build file. `manifestImports` and the plugin deployer's `MANIFEST_IMPORTS` shall hold the same files. The Merger reads at most a pull request's first 100 changed files and doesn't queue one with more, so a manifest file past the 100th is never queued without a person; the plugin deployer refuses such a pull request too. When a pull request's reviewer has approved its head and only Julian's approval for a manifest file is missing, `pr_status`'s next step shall ask for Julian's approval alone.

## Examples

- Given a pull request that changes only `tooling/paperclip/src/seat-mover/settings.ts`, which `plugin/seat-move-declaration.ts` imports,
  when `manifestFileOf` reads its files and the Merger's gate runs with Liam's approval on the head,
  then it names that file, it isn't enqueued and the gate says it needs Julian's approval on the head too; with Julian's as well, it is enqueued.
- Given `plugin/manifest.ts` with a new import of a module that isn't in `manifestImports`,
  when the check runs,
  then it fails naming that module.
- Given `manifestImports` with a module no manifest imports any more,
  when the check runs,
  then it fails naming that module.
- Given Liam's approval on the head of a pull request that changes `tooling/paperclip/src/plugin/manifest.ts`, and no approval from Julian,
  when `pr_status` reads it,
  then its next step is to get Julian's approval on this head, and doesn't ask for another review by the path rules.
