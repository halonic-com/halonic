# Decision: Get updates' refusal over a file Halonic leaves to git has no Try again

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16477 (fix decided on the visual check C711, HAL-16447, row 9)
- Kind: user-visible

Get updates refuses to start when the shared copy changed a file Halonic leaves to git, such as
`.env.example` (HAL-16343). Its toast still offered Try again, which is refused the same way until
the person gets those updates with git. #5094 dropped Remove from Inbox in the same situation for
the same reason.

The refusal is now a `conflict` error (its state doesn't allow this until another step comes
first) instead of `unavailable` (a retry may work). The Changes page turns a `conflict` from Get
updates into a `refused` outcome, whose toast keeps the title, the reason and "Nothing changed
here." but has no Try again. Every other failure to get updates keeps Try again. The words are
unchanged.

The requirement `source-control.get-updates-per-item` gains this sentence and an example. A new
UI test checks both toasts, and a new test checks the refusal's kind. No test was weakened.

## Covers

- source-control.get-updates-per-item
- packages/studio/features/source-control/src/ui/merge-choices.test.tsx
- apps/studio/src/changes/workspace-merge.test.ts
