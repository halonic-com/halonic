# @halonicjs/action-steppers

Pure code for user-only action steppers: the `halonic.stepper-request/1` format, `validateStepperRequest`, the manual guide, strict
parameters and the user's requester policy. No IO and no timers. The design is the steppers architecture note
(HAL-17491) and the ADR `docs/adr/2026-11-24-action-sender.md`.

- **Layer:** core
- **Owner:** owen
- **Public API:** `@halonicjs/action-steppers`

## Example

```ts
const checked = validateStepperRequest(documentBody, catalog);
if (!checked.ok) return showReasons(checked.error); // each reason names its block
showPreview(checked.value.touches, checked.value.risk);
cardBody = renderManualGuide(checked.value, catalog); // the same request as numbered steps to do by hand
```

Every API step carries a `manual: { url, instructions }` form, so the manual guide can always say how to do it on the
service's own page; `manualFormProblems` lets the catalog's tests check each definition.

API steps (`call`, `check`) are a `{ kind: "script", ref }` placeholder until the ToolScript ADR (HAL-17560); address
and body building, the plan, resume rules and the stepper service come in the next pull request.
