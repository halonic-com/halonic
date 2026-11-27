# Decision: `halonic serve` tells the sample by its id

- Task: HAL-19432
- Approval: Liam chose option A on HAL-19432 (recognise the sample by the id `acme` its `workspace.yaml` carries), with the conditions this pull request follows. The lower case after the colon in the Home line is Julian's [minor] from the review of #6436.
- Kind: user-visible

## What changes

`GET /api/workspace` from `halonic serve` answers `sample: true` when the live `workspace.yaml` carries the sample's id `acme`, and `sample: false` otherwise. Until now it always answered false, so a served Studio never showed the Home line for the sample, the picker's Demo tag or the sample chip. The requirement `cli.commands.serve.serve` replaces "`sample` false until Welcome has one (HAL-9089)" with that rule and gains one example; the existing `sample: false` example now names its id, `acme-shop`. The tests for it are in `serve.test.ts` and `workspace-facts.test.ts`; their fixtures that expect `sample: false` now use the id `acme-shop`, so that scenario stays a real one, and a new test checks the id against `examples/acme/workspace.yaml`.

`inbox.home-next-step` writes its served demo line with a lower case after the colon: "Start one on your computer: run the Support reply workflow in Studio.", with the same change in its tests. No test was weakened or skipped.

## Why

Studio's Open demo and `halonic init --example acme` copy the sample's `workspace.yaml` unchanged and write no other marker, and `serve` can't read the desktop app's Recent list. The id is the one thing every copy carries, including copies that already exist. A person who gives their own workspace the id `acme` sees a Demo tag; `sample` only changes what Studio shows, nothing resets or blocks on it. An explicit marker would change the workspace format across 3 or more packages and still miss existing copies.

## Covers

- cli.commands.serve.serve
- inbox.home-next-step
- apps/cli/src/commands/serve/serve.test.ts
- apps/cli/src/commands/serve/workspace-facts.test.ts
- packages/studio/features/inbox/src/ui/needs-you-card.test.tsx
- apps/studio/src/studio/served-studio.test.ts
