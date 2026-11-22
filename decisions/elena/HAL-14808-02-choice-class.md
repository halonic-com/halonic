# Decision: the first run's model choice moves into `@halonicjs/app`

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14808 (Liam's D4 on the plan: the class moves into core, so `halonic serve` can use it)
- Kind: internal

## What changes

`FirstRunModelChoice`, its trust preview and its test secrets move from `apps/studio/src/models/`
into `packages/core/app/src/`, with their four test files and their test helper. The tests move
unchanged apart from their imports: a core `choiceKey` stands in for Studio's `SecretText`, and the
fake time limit gives an `AbortSignal` in place of a timer callback. Every test still runs, with the
same `expect` calls, under the same requirement IDs.

## Why

`halonic serve` is to use the same model choice as the desktop app (HAL-14808), and the CLI can't
import the Studio app. Core may not use Studio packages or create an `AbortController`, so the
class now takes plain core types: a `ModelChoiceTrust`, the file reads and key save from #5141,
and a `timeLimit` part the host makes. The guard sees the old test files as deleted because they
moved to another package. No test was weakened.

## Covers

- apps/studio/src/models/first-run-model-choice.test.ts
- apps/studio/src/models/first-run-choice-trust.test.ts
- apps/studio/src/models/first-run-saved-key.test.ts
- apps/studio/src/models/first-run-new-key-origins.test.ts
