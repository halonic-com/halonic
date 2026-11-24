# @halonicjs/action-steppers

Pure code for user-only action steppers (architecture note on HAL-17491). This first step holds the user's requester
policy; the `halonic.stepper-request/1` format, `validateStepperRequest` and strict parameters follow in the next pull
request, because a new core package lands empty with its `coreOrder` entry first (`docs/guides/checks.md`). No IO and no
timers.

- **Layer:** core
- **Owner:** owen
- **Public API:** `@halonicjs/action-steppers`

## Example

```ts
if (decideRequester(policy, attestedSource, claimedAgent, risk) === "blocked") return showBlockedBySettings();
```
