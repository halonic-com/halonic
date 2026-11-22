# Decision: list the Agent tools plugin's dependencies before the plugin

- Approval: Liam approved the dependency on HAL-15359 (22 Nov); he reviews it and signs this note as the CTO
- Kind: internal

CI's "Policy rules (base commit's copy)" job checks a pull request against
the base commit's `tooling/check/dependencies.json`, so a new dependency
fails there until its entry is on `main`. The PR watcher plugin (#4962)
adds `@paperclipai/plugin-sdk` and uses `esbuild`, so its entries land
first, in this pull request, as `docs/guides/dependencies.md` does for
patches. The entries are the ones Liam already reviewed on #4962.

- `@paperclipai/plugin-sdk`: dev tooling, only in
  `@halonicjs/tooling-paperclip`, pinned to 2026.1117.0 (the catalog entry
  comes with #4962). Until then no package uses it, which is only a warning.
- `esbuild`: `@halonicjs/tooling-paperclip` may use it to bundle the
  plugin's worker and manifest.

## Covers

- tooling/check/
