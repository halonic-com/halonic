# Decision: Review and the trust gate only for the engine's untrusted refusal, outside the Inbox

- Task: HAL-15002
- Approval: asked for by Liam as the follow-up to HAL-14813 (#4392); decided by the team on HAL-15002 (HAL-2282: it builds on the untrusted line and **Review** the team already decided on HAL-13143 and HAL-13177, and adds no new words)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:e1nKbBkMEwVjR1A8MFntzqLamS7GE+QDH/CZs0h7/2ECeBSzW9+U8aqkXbQCdnwn8wOAfGRWckJXUxJLeTuHDg==

## What changes

- `workflows.start.start-run` and `runs.run-view.run-again-review`: the Run panel's start card and the run page's **Run again** share `StartFailedCallout`, and both offer **Review** in place of **Try again** only for a refusal with the code `workspace.untrusted` (`isUntrustedRefusal` in `@halonicjs/studio-shell`, from HAL-14813). Any other `denied`, such as a folder that isn't open, says "Couldn't start the run: *its own reason*" with **Try again**. Each requirement gets an example for it.
- `agents.chat.not-trusted`: the Try it chat takes the turn back and opens the trust gate (or shows the "Not started" toast) only for that code. Any other `denied` ends the reply as a failure in its own words, "Sorter's reply failed: *reason*.", as other failures already do. The requirement gets an example for it.
- Tests: the existing untrusted tests (`start-run-trust`, `run-again`, `card-receipt`, `try-it-engine`) now throw the engine's real refusal, `WorkspaceUntrusted`, instead of a bare `denied`. Each still asserts the same sentence and buttons; none is removed or weakened. New tests for the start card, Run again and the chat cover a `denied` that isn't about trust; each fails before this change.

## Why

All three read every `denied` as the untrusted workspace. The Tauri stores map `folder_not_open` to `denied`, and a served engine's other 403s are `denied` too, so in those cases Studio offered **Review** or opened the trust gate when trust wasn't the problem, and the chat hid the real reason. HAL-14813 gave the engine's refusal its own code; matching on it is exact.

## Covers

- workflows.start.start-run
- runs.run-view.run-again-review
- agents.chat.not-trusted
- packages/studio/features/workflows/src/start/start-run-trust.test.tsx
- packages/studio/features/runs/src/run-view/run-again.test.tsx
- packages/studio/features/runs/src/run-view/card-receipt.test.tsx
- packages/studio/features/agents/src/chat/try-it-engine.test.tsx
