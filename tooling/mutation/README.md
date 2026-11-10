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

To run it on your branch in CI instead of locally, use the manual workflow
(`.github/workflows/mutation.yml`):

```sh
gh workflow run mutation.yml --ref <branch> -f packages=packages/core/yaml
```

`packages` takes one or more target folders separated by spaces; leave it out
for every target. The table lands in the run's job summary.

A package is skipped ("no code yet") until it has a source file other than its
tests and `src/index.ts`. A package with a floor fails the run when its score
is under it, and so does a Stryker run that breaks. The floors live in
`mutationFloors` in `src/score.ts` (`packages/core/schema-kit`: 98%,
`packages/core/yaml`: 85%) and can only go up. Packages without a floor only
report; they get one once their score is stable.

Stryker's own `stryker.config.*` files aren't used: the runner writes the
config for each package into a temporary folder (see `src/targets.ts`).
