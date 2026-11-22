# Decision: the workspace trust check asks for the yes to run integrations without the sandbox

- Task: HAL-15144
- Approval: Liam approved the plan on HAL-15144 (https://paperclip.halonic.com/HAL/issues/HAL-15144#document-plan), PR 2, after his option B on HAL-3384 part 6. It builds the board's approved "Runs" line decisions on HAL-1949 (R-D1 A), microcopy 24.1 R5, R6 and R12, and the design on HAL-1873, sections 4 and 7.
- Kind: user-visible

## What changes

- `studio.workspace-trust-integrations`: where integration code can't run in the sandbox, **Runs** gives R12's amber line in place of R11's "Doesn't start on this computer.", the row's name gets "· not in the sandbox" and the section the triangle. Without a saved yes for the reason, the check asks with R5's checkbox, and **Trust** saves the yes first, then trust; with one, R6 replaces the checkbox. The summary counts the integration as run. Option A's team note on R11 goes, because it said this would come once the command line honours the yes, which it does now (`cli.local-integration-unfenced-yes`, #4534). Its tests change with it: the two that expected R11 and no checkbox now expect R12, the flag and the mark, and the one that read a saved yes as "doesn't start" now expects its day. New tests cover the yes saved before trust, a changed reason, a yes the host couldn't save, and no yes without the tick or in the sandbox.
- `studio.desktop-unfenced-runs`: the workspace trust check gets the same one object per window as the plugin check and Take back, so a yes from either check waits for a Take back under way. A new test checks it's the same object.

## Why

The CLI now honours the yes for local integrations (PR 1, merged), so the check can ask for it without promising a start that nothing makes (Liam's rule on HAL-3384: the checkbox never shows before the CLI honours it). Both checks use the same words, the same checkbox and the same saved yes, as design section 4 says.

## Covers

- studio.workspace-trust-integrations
- studio.desktop-unfenced-runs
