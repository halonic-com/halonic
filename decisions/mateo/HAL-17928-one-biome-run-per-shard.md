# Decision: each build shard lints its packages in one Biome run

- Task: HAL-17928 (item C of the merge-time report on HAL-17891, routed on HAL-17926)
- Approval: Liam decided on HAL-17928 (24 Nov) to replace the per-package lint task in a shard with one Biome run per shard; Liam signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Nk0gJo0A+PyuQVaGlnZ5QT9HC1fBFeEgrxpua0G6/ycqACLJDHfpYt1iqvXsSUr8wbgwF+7clt8I+3PMss41BQ==

## What changes

- `.github/workflows/ci.yml`, the "Typecheck, lint, test, build" job: the step "Run every task
  through the cache" runs `typecheck test build` (and `typecheck build` plus the affected tests)
  through Turbo, without `lint`. A new step, "Lint the shard's packages (one Biome run)", runs
  after it, also when it failed. It reads the shard's filters from `BUILD_SHARDS`, asks
  `turbo run lint --dry=json` which packages have a lint script, and runs
  `biome check --max-diagnostics=none` once over those packages' folders.
- The step fails when a package's lint script is anything but `biome check .` (so no package
  drops out unnoticed), when the shard has no line in `BUILD_SHARDS`, or when it finds no package
  with a lint script.
- `turbo.json`, `biome.json` and every package's `lint` script are unchanged: `turbo run lint`
  and a package's `pnpm lint` still lint per package outside CI.
- `docs/guides/checks.md` describes the new step.

## Why

Each Biome run first reads the whole repo, so as a Turbo task lint cost about 34 s per package,
125 times per run, about a third of a shard's work (HAL-17891). One run over a shard's folders
checks the same files with the same config, the nested `packages/studio/kit/biome.json`
included, in 3 to 5 s on CI.

## Tests

No rule, check or test was skipped or weakened. Locally, in all 9 shards the files the
per-package runs check add up to exactly the files the one run checks. A `node:` import in
kit's `src` fails both ways, so the nested config still applies. A throwaway commit with a lint
error in one package per shard (CI run 45508813845) failed the new step in all 9 shards.

## Covers

- .github/
