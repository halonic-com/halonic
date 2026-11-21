# Decision: the first-run bar and guide card replace Home's Try the sample card

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-7993 (the board approved the first-run flow on 19 Nov, which replaces the sample card); build plan on https://paperclip.halonic.com/HAL/issues/HAL-13433 (Liam's build notes: "The card, `sample-progress.ts`, `sample-text.ts`, `step-openers.ts` and the `sample-card` requirement go")
- Kind: user-visible

The approved first-run flow (first-run-flow, HAL-7985, revision 7) guides the demo with a first-run bar under
the top bar and a guide card on Support reply's page, from **Open demo** until the first win. Home's three-step
**Try the sample** card did the same job in the older flow (HAL-663), so it goes, and Home's Get set up slot is
empty again until a feature fills it. The requirement `first-run.sample-card` is retired. Its tests go with the
card: `src/ui/sample-card.test.tsx` and `src/sample-progress.test.ts` are deleted with the code they tested, and
`src/first-run.test.ts` and `src/feature.test.ts` now test the new first-run state (`first-run.state`). The new
behaviour has its own requirements and tests: `first-run.state`, `first-run.bar` and `first-run.guide-card`.

The app's `SampleWorkspace` still saves the card's steps per folder (`studio.try-sample`); nothing reads
them any more. Removing that is a separate clean-up, so this note doesn't touch that requirement.

## Covers

- first-run.sample-card
- packages/studio/features/first-run/src/ui/sample-card.test.tsx
- packages/studio/features/first-run/src/sample-progress.test.ts
- packages/studio/features/first-run/src/first-run.test.ts
