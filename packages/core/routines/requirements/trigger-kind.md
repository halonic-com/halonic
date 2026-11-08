# routines.trigger-kind

- Status: active
- Since: 0.1.0
- Source: `triggerKind` in the old routines package (`packages/core/routines/src/schedule.ts`) at 784f78d

The routines package shall name the kind of a trigger (`schedule`, `every`, `mail`, `signal` or `manual`) from the one key the trigger has.

## Examples

- Given `{ every: "15m" }`, when its kind is asked, then it is `every`.
- Given `{ manual: true }`, when its kind is asked, then it is `manual`.
