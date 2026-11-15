# Decision: Studio tests wait with `waitUntil`, so their expect count is fixed

- Task: HAL-9816 (follow-up to HAL-9336)
- Approval: HAL-9816 asks for this change; Liam approves this note in review
- Kind: internal

## What changes

23 `vi.waitFor(() => expect(...))` calls in the Studio tests now wait with `waitUntil` from
`@halonicjs/testing-spec`, which names what it waits for and gives up after a deadline, and then
check the same thing once with `expect`. Every test checks exactly what it checked before. The
`expect` count of each requirement goes down to the lowest number a run could ever have reached,
and then stays the same on every run.

## Why

`vi.waitFor` runs its callback again on every try, so every retry counted as one more `expect`.
The guard compares that count with the base commit's, so a slow run could fail a pull request
that did not touch the test (HAL-9336). These edits touch the test files, so the guard's
`vi.waitFor` exception (HAL-6369) does not apply to them: the drop is real, and it is the last
one, because the count can no longer vary with timing.

## Covers

- settings.ai-agent-key-line
- shell.save-state
- studio.desktop-plugins-host
- studio.entry
- studio.open-folder
- studio.settings
- studio.starting
- studio.window-appearance
- studio.workspace-connector-status
- studio.workspace-google-setup-accounts
- studio.workspace-trust
- workspace.busy-switcher
- workspace.failed-open-leaves-no-slot
- workspace.open-folder
- workspace.recent-reopens-picked-folder
- workspace.saves-itself
