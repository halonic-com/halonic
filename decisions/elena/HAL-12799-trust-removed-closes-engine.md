# Decision: removing a workspace's trust while its engine is open closes the engine

- Approval: Julian's follow-up from his security review of PR #3756 (HAL-12792), accepted by Liam and filed as HAL-12799; Julian reviews the security change, Liam signs this note with the pull request
- Kind: user-visible
- Task: HAL-12799

## What changes

`studio.untrusted-starts-nothing`: the Studio's engine now hears the workspace's trust. Whenever it changes while the engine is open (a person removes it in Settings › Trust or Settings › Trusted sources, or a save checks it again), the engine checks the workspace it loaded by the same rule it opens by. On a no it closes the way closing the workspace closes it: the routines stop, the executor stops every harness run and model call going on, the scheduler stops delivering timers, and the engine's lock is given back. A run whose harness step was still waiting on its timer never starts that step in this window; like any run the engine lost, it ends as `interrupted` when an engine next opens on the workspace. A check that fails is a no, as everywhere in this rule. The next start opens the engine afresh, which checks trust again and refuses.

No assertion changed: the new tests are added next to #3756's, with a control that the same harness step does run while the trust stays.

## Why

After #3756 every start checks trust again, and the model resolver refuses real models in an untrusted workspace on every call. Julian found one gap left: an engine already open kept running the runs that had started, on their timers, and a harness step in such a run wasn't checked against trust again. Closing the engine closes that gap with the code path closing the workspace already uses.

## Decided by the team

- The engine checks the content it loaded, not the page's latest check, so a save that changes the files doesn't close an engine whose content is still trusted.
- A check that fails (for example, the trust record can't be read) closes the engine. That can stop a run on a passing read error; we accept it, because a failed check counts as no everywhere else in this rule.
- No new wording: the engine closes without a message, the runs show as interrupted as for any engine that stopped, and the next start shows the existing refusal "This workspace isn't trusted yet, so nothing was started."
- A trust removed outside the window (`halonic trust revoke` in a terminal) is seen at the window's next trust check, not at once. The resolver and the check before each start still hold in the meantime.

## Covers

- studio.untrusted-starts-nothing
