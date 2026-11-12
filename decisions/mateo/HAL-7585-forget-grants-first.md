# Decision: forget the user's kept grants before the sandbox's machine-wide removal

- Task: HAL-7585 (Liam's follow-ups from his review of HAL-7558 on #2138)
- Approval: the task asks for this change; Liam approves this note in review on [HAL-7585](/HAL/issues/HAL-7585)
- Kind: internal

## What changes

`sandbox-srt.remove` changes the order of its two halves when it goes through the helper. The agent host first takes back the grants srt kept for this user (`profile forget`, `acl forget --all`), without administrator rights, and only then starts the helper for srt-win's machine-wide step. When that first step fails, as while a sandboxed program runs, the removal stops before the administrator prompt. When the agent host runs with administrator rights it still skips the first step (HAL-7544), and now logs a line saying so.

## Why

This is the order srt's own uninstall uses. With the old order, a removal while a sandboxed program ran showed the administrator prompt, removed the machine-wide part, then failed on the user's grants; trying again showed a second prompt. Now the failure comes first and costs no prompt. The log line makes a skipped step visible in the uninstaller's log instead of silent.

These are the adapter's own requirements, so the note is internal. The log line goes to the agent host's stderr, not to a screen users see.

## Covers

- sandbox-srt.remove
