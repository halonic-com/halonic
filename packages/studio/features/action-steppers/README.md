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
`irreversible` step.

The Inbox opens an action item through `api.ts`: `reviewActionItem` checks the item's request again
with `validateStepperRequest` from `core/action-steppers`, against the installed catalog
(`ActionCatalogService`), applies the user's requester policy (`RequesterPolicyService`) to the
source the messaging provider attests, and builds the view in review mode (requirement
`action-steppers.review-mode`). Until the desktop shell runs steps (HAL-17535), the stage is
`desktop-only`, and `reviewOnlyActions` wires only **Decline**. Without the services, the catalog is
empty and the default policy holds.

| State | What the user sees |
| --- | --- |
| `ready` | what it touches, the review, the steps, **Run step 2 of 3**, **Run all steps** when every step is a routine API call, a browser step's page and instructions, **Do it by hand** and **Mark done by hand**, **Decline** |
| `sign-in` | **Sign in to GitHub** and then GitHub's device code, or the permissions a Cloudflare token needs and **Paste the token** (the desktop app's secure field) |
| `missing-permission` | the missing permission by name and **Sign in again** |
| `declined`, `expired`, `finished` | one line, no buttons |
| `not-available` | the request's definition isn't in this version; no steps |
| `desktop-only` | "Open it in the desktop app to run it.", **Copy instructions** on each browser step, and **Decline** |
| `blocked` | "Blocked by your settings. This requester may only ask for routine changes." and **Decline** |

Every sentence is in `src/ui/stepper-words.ts`.

Each new view is compared with the one before (`src/ui/stepper-changes.ts`): its results are said
through one status region that is on the page from the start, and when the pressed control went
away with the change, focus moves to the title, GitHub's code, the next browser step or the done
step's line (`action-steppers.results`).

## Example

```tsx
<ActionStepper view={view} actions={stepperActions} />
```
