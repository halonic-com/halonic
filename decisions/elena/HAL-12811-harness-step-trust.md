# Decision: each harness step asks the workspace's trust again, right before it starts

- Approval: Julian's follow-up from his security review of PR #3761 (HAL-12808), decided on HAL-12810 and filed as HAL-12811; Julian reviews the security change, Liam signs this note with the pull request
- Kind: user-visible
- Task: HAL-12811

## What changes

`engine.harness-may-start` (new): the local executor takes an optional `mayStartHarness` check next to `budget`, and asks it right before each harness step starts, after everything else the step needs is ready. On a no, or a check that rejects, the step starts nothing (no sandbox, no harness, no bridge) and the run fails with a `denied` error whose cause is `engine.untrusted-workspace`, naming the agent and its harness. Without the check nothing changes, so the CLI and Cloudflare run as before.

`studio.untrusted-starts-nothing`: the Studio's engine gives that check the same answer `mayStart` gives on the workspace it loaded, failing closed. So trust removed where the window doesn't hear it (`halonic trust revoke` in a terminal), or while the engine is still checking whether to close after a trust change, now stops the next harness step at once instead of at the window's next trust check. No assertion changed; the new tests are added next to #3761's.

## Why

After #3761 two Low gaps were left (Julian, HAL-12808): a harness step whose timer fired while the close's own trust check ran could still start, and trust removed outside the window was heard only at the window's next trust check. Model calls were already refused at once by the resolver on every call; harness steps now are too.

## Decided by the team

- The Studio uses `mayStart`, not the resolver's `isTrusted`. For a harness step they give the same answer: an agent that starts a harness program is part of the trust content, so such a workspace never counts as reaching only the test model, and `mayStart` is no exactly when it isn't trusted. Using `mayStart` keeps one rule for every start in the Studio.
- The check sits last before the harness starts, not at the top of the step, so the time between the answer and the start is as short as it can be.
- The refusal has the resolver's shape (a `denied` error with a cause code, the run's reason `error`), so no new failure reason is added to the run log. Its text is new, in the words of the existing refusals: "Agent "{agent}" runs in {harness}, and this workspace isn't trusted on this computer, so Halonic didn't start it." with the fix "Check the workspace, then trust it."
- The cost is one more trust check per harness step, a few IPC calls; a harness step runs for seconds to minutes, so it doesn't show.
- The check covers the harness steps of runs only. A chat turn with an agent in a harness takes another path in the executor, and the Studio's engine never asks for one, so there is nothing there to check yet.

## Covers

- engine.harness-may-start
- studio.untrusted-starts-nothing
