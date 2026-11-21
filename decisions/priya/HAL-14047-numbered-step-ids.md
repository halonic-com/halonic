# Decision: number a new step from step-1 and wait-1

- Approval: decided by the team under HAL-2282 and recorded in HAL-14047 (from the C296 design check in HAL-14032)
- Kind: user-visible

A step added from the canvas's toolbar was named `step` or `wait`, so its card's title read "Step step". New steps are now numbered from the first, `step-1` and `wait-1`, then the next free number. The unique-name function gains an option to number every name from 1; callers that don't ask for it behave as before, and both existing examples of std.unique-name stay. The layout requirement's examples change from `step` to `step-1` and from `wait`/`wait-2` to `wait-1`/`wait-2`.

## Covers

- studio.workspace-workflow-layout
- std.unique-name
