# Decision: a partial Take back says what may still run and what stops it

- Task: HAL-15786 (flow check C630 #2, HAL-15782)
- Approval: team wording (HAL-2282), building on R16's approved Take back; Elena decided the words with Sofia on HAL-15786; Liam signs this note
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:AASbWCpCxXFrfSz8SXuty0ZkCMXxvW5skPmPG/YXEoS+168DGWBxDVOUOQxi+3jSGlwCS65b4HiRsfZe1yCyAg==

## What changes

`settings.unfenced-yes-take-back`: when the agent host answers `take_back_incomplete`, the warning "Taken back, but
some plugins and integrations didn't stop." used to carry the full success line, "Plugins and integrations won't
start without the sandbox until you allow it again. Halonic asks again the next time one starts." Code was still
running without the sandbox, and nothing said what to do about it.

The line under the warning is now "They may still be running without the sandbox. Halonic keeps trying to stop
them. To stop them now, quit Halonic." Sofia OK'd it on HAL-15796, with one sentence per idea and the action last.
Both halves hold on `main`:

- The host keeps a runner that didn't stop registered and tries again every second while the yes it started under
  is gone (`UnfencedRuns.#checkSavedYes` in `packages/core/app/src/unfenced-runs.ts`). A stop that ran past the
  10-second limit may also still finish.
- Quitting Studio closes the agent host's input, and the host then stops every plugin runner. Its exit handlers kill
  each runner's process group (`host.stop`, `stopOnLauncherExit`).

The host reports only how many didn't stop, not which, so the line doesn't name them.

No test was weakened or skipped. The `take_back_incomplete` test now expects the new line, and the requirement gets
an example for it.

## Covers

- settings.unfenced-yes-take-back
