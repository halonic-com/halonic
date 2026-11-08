# @halonicjs/tooling-mutation

Runs Stryker mutation testing on the core packages
(`workflow`, `routines`, `schema-kit`, `yaml`, later `engine`) and reports
a mutation score per package. Mutation testing changes the code on
purpose, for example `>` to `>=`, and checks that a test fails. It is the
only check that notices a test whose assertions were hollowed out.

- **Layer:** tooling
- **Owner:** mateo
- **Public API:** `@halonicjs/tooling-mutation` (`scoreOf`, `summaryTable`, `hasCode`, `strykerConfig`, `mutationTargets`)
- **Requirements:** `mutation.score-per-package`, `mutation.only-packages-with-code`

## Running it

CI runs it every night (`.github/workflows/scheduled.yml`) and writes the
table into the job summary. To run it yourself, from the repo root:

```sh
pnpm exec node tooling/mutation/src/cli/mutation.ts                       # every target
pnpm exec node tooling/mutation/src/cli/mutation.ts packages/core/yaml    # one target
```

A package is skipped ("no code yet") until it has a source file other
than its tests and `src/index.ts`. For now the run only reports: a low
score never fails, only a Stryker run that breaks does. Once the scores
are stable, each package gets a floor that can only go up.

Stryker's own `stryker.config.*` files aren't used: the runner writes the
config for each package into a temporary folder (see `src/targets.ts`).
