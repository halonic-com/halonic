# Decision: the real process-table tests wait 20 s, not vitest's 5 s

- Requirements: `system-node.resource-probe`, `contracts.resource-probe`
- Task: HAL-3084, found on the new Windows sandbox job (HAL-2646)
- Approval: the maintainer; Julian reviews it as the owner of the contract suite

## What changes

Two tests that read this machine's real process table get an explicit 20 s timeout:
`lists a process this one started, by its real pid` in `adapters/system-node`, and
`lists the processes below the engine once each, in pid order` in the ResourceProbe contract.
Nothing they check changes.

## Why

On Windows the reader starts Windows PowerShell and runs `Get-CimInstance Win32_Process`. Over the
first 12 runs of the Windows job these tests took 1.8 to 4.3 s when they passed, and 2 runs
failed at the 5 s default. That is a cold PowerShell and WMI start on a shared runner, not a
hang. The adapter itself allows the program 15 s (`run-program.ts`), so the test's limit sits
above that: a reader that really is too slow fails with the adapter's own error, not vitest's.
