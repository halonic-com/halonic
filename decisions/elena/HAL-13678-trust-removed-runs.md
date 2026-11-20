# Decision: removing trust ends the runs it stopped at once, and the Remove trust dialog says so

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13678 (decided by the team with Sofia as designer, HAL-2282, from Kim's C210 check HAL-13658 of HAL-12799)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ODFHLI1QONteVQPwv7QfO88JumS0x8jkGowtP5hwx+v5EwdpS5bs+g5DScO+iPtfzaJd/dzKy8EpdkXAuBBVCA==

## What changes

Since HAL-12799, removing a workspace's trust while its engine is open closes the engine, and its runs stop. They stayed `running` in the log until an engine next opened on the workspace, which an untrusted workspace never does, so the run card, Runs, Home and the run page kept saying "Running" (and even "Waiting for Ollama"), after a reopen too.

Now the Studio ends each run it stopped right after the engine closes, as a run the engine lost ends: `run.failed` with `reason: "interrupted"`, plus the typed cause `{ kind: "denied", code: "workspace.trust-removed" }` (`studio.trust-removed-ends-runs`, `engine.end-stopped-runs`). Its banner then says "{workflow} stopped because this workspace's trust was removed during the step {step}. Nothing after that step ran." (`runs.run-view.trust-removed`).

The Remove trust dialog's line, in Settings › Trust and in Settings › Trusted sources, becomes "Its routines and connectors won't start until you trust it again, and runs in progress stop." This edits the quoted line in `workspace.trusted-sources` and the two tests that assert it; each test still asserts the full line, with the new words.

## Decided by the team

- The reason stays `interrupted`, with a typed cause, rather than a new reason `trust-removed`: the CLI and every reader of reasons already handle `interrupted`, and the run page reads causes by code (as for `google.api-disabled`). No event type changes.
- A parent waiting on a run that ends this way ends too, with the same reason and cause, since nothing would wake it; its other waiting children are cancelled as on an engine start.
- **Run again** stays on the banner. While the workspace isn't trusted, the engine refuses it with the existing "This workspace isn't trusted yet, so nothing was started." and starts nothing; RT1 (HAL-13143) adds **Review** to that refusal.

## Covers

- workspace.trusted-sources
- packages/studio/features/workspace/src/trust/workspace-trust-section.test.tsx
- packages/studio/features/workspace/src/trusted-sources/trusted-sources-section.test.tsx
