# Decision: `halonic serve` and `halonic init` read the workspace's template.yaml

- Task: HAL-19432
- Approval: the board chose the template design on HAL-19432 (step 1 only: its own file `template.yaml`, no `acme` fallback), after Liam's review of the `template-design` document. The lower case after the colon in the Home line is Julian's [minor] from the review of #6436.
- Kind: user-visible

## What changes

`GET /api/workspace` from `halonic serve` answers `sample: true` when the workspace's saved `template.yaml` has `kind: demo`, and `sample: false` otherwise. Until now it always answered false, so a served Studio never showed the Home line for the sample, the picker's Demo tag or the sample chip. A template it can't read gives `sample: false` and one `!` line, and it still serves. The requirement `cli.commands.serve.serve` replaces "`sample` false until Welcome has one (HAL-9089)" with that rule and gains two examples; the existing `sample: false` example now says the workspace has no template.

`halonic init --example acme` takes the workflow and input of its `halonic run` line from the copy's `template.yaml` instead of a list in the code. The output for Acme is unchanged. A template it can't read leaves the line out, after one `!` line; the copy is still made. `cli.commands.init.copy-example` says so and gains one example. Its test that the run line names a workflow of the copy now reads the workflow from the template.

`inbox.home-next-step` writes its served demo line with a lower case after the colon: "Start one on your computer: run the Support reply workflow in Studio.", with the same change in its tests and the served Studio's test. No test was weakened or skipped.

## Why

The board wants the sample described in files that people can later use to share their own workspaces, not recognised by its id. `halonic init acme` already makes a blank workspace with the id `acme`, so the id would mislabel it. A template is a claim anyone can write, so it only changes what is shown and which run `Next:` suggests: nothing is reset, deleted, run or trusted because of it (Liam's review). `serve` reads the saved file, not the committed one, because the template has no place in the workspace loader; that only changes when a new `kind` shows, never what runs.

## Covers

- cli.commands.serve.serve
- cli.commands.init.copy-example
- inbox.home-next-step
- apps/cli/src/commands/serve/serve.test.ts
- apps/cli/src/commands/serve/workspace-facts.test.ts
- apps/cli/src/commands/init/command.test.ts
- packages/studio/features/inbox/src/ui/needs-you-card.test.tsx
- apps/studio/src/studio/served-studio.test.ts
