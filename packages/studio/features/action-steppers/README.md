# @halonicjs/studio-feature-action-steppers

The screen where the user reviews an agent's action request (approve a release deployment, change
a ruleset, set a DNS record) and runs its steps one by one with their own sign-in. Agents can only
file a request; they never run a step. Design: the architecture note on HAL-17491, sections 1.3,
2.3 and 2.4.

- **Layer:** studio
- **Owner:** noah
- **Public API:** `@halonicjs/studio-feature-action-steppers` (the feature) and `@halonicjs/studio-feature-action-steppers/api`

## How it's built

The screen draws a feature-local view model, `StepperView` in `src/stepper-view.ts`, and calls
back through `StepperActions`. It holds no rules of its own beyond asking once more before an
`irreversible` step. A later pull request fills the view model from `core/actions` and the app
service and adds the screen to the Inbox.

| State | What the user sees |
| --- | --- |
| `ready` | what it touches, the review, the steps, **Run step 2 of 3**, **Run all steps** when every step is a routine API call, a browser step's page and instructions, **Do it by hand** and **Mark done by hand**, **Decline** |
| `sign-in` | **Sign in to GitHub** and then GitHub's device code, or the permissions a Cloudflare token needs and **Paste the token** (the desktop app's secure field) |
| `missing-permission` | the missing permission by name and **Sign in again** |
| `declined`, `expired`, `finished` | one line, no buttons |
| `not-available` | the request's definition isn't in this version; no steps |
| `desktop-only` | "Open it in the desktop app to run it." and **Decline** |

Every sentence is in `src/ui/stepper-words.ts`.

## Example

```tsx
<ActionStepper view={view} actions={stepperActions} />
```
