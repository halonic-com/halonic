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
`action-steppers.review-mode`), with the stage `desktop-only`. `useStepperRun` (a `StepperRun` in
`src/run/`) then takes over (requirement `action-steppers.shell-run`): in the desktop app it reads
the request's record and the sign-in through the `ActionSteps` app service of `studio/services`,
so the request is `ready`, asks for a sign-in, or resumes where it stopped; it sends each step
with its values sorted by the catalog's route into placeholders and body, records steps the user
did on the page or by hand, and answers the item through `AgentMessaging` when the stepper ends,
with only "set on <day>" for a value typed in the shell's secret dialog. A result pasted back into
a browser step's field is checked against the step's pattern and for key shapes
(`checkPastedResult`, requirement `action-steppers.pasted-result`) and kept as `kept.result`; one
that fails says why under the field and records nothing. Once a `check` step has succeeded, each
step's line shows the definition's preview with today's values next to the change, and the
request's `expect` is compared with what the check kept (`checkExpect`, requirement
`action-steppers.expect-stop`): a difference sends none of the later steps, ends the request as
failed with the next step `state-changed`, and shows "This changed since the request: …" with the
values apart from it. A check's `requires` rule stops the request the same way, with the
definition's own reason (`action-steppers.shell-check-gate`), and so does a rule comparing what
the check kept with one of the request's parameters, or a request whose `expect` lacks a name the
check lists in `requiredExpect` ("This request doesn't say what the requester saw: …",
`action-steppers.shell-gate-request`). A `parameter-list` body field sends its definition step's
parameter as a one-item list, such as `environment_ids: [161]`, and **Show the request** shows the
same body. A `check` that names `changedAfterStart`, such as the Actions secret's
`updated_at`, is done only when that time is later than when the stepper first opened the guided
step's page (requirement `action-steppers.changed-after-start-run`); otherwise it shows as failed
with its message and the run bar offers it again. All of these come from the record, so a request
opened again stops the same way.
Outside the desktop app it runs nothing and **Decline** still answers. Without the services, the
catalog is empty and the default policy holds.

| State | What the user sees |
| --- | --- |
| `ready` | what it touches, the review, the steps, **Run step 2 of 3**, **Run all steps** when every step is a routine API call, a browser step's page and instructions, **Do it by hand** and **Mark done by hand**, **Decline** |
| `sign-in` | **Sign in to GitHub** and then GitHub's device code, or the permissions a Cloudflare token needs and **Paste the token** (the desktop app's secure field) |
| `missing-permission` | the missing permission by name and **Sign in again** |
| `declined`, `expired`, `finished` | one line, no buttons |
| `not-available` | the request's definition isn't in this version; no steps |
| `desktop-only` | "Open it in the desktop app to run it.", **Copy instructions** on each browser step, and **Decline** |
| `blocked` | "Blocked by your settings. This requester may only ask for steps marked Routine." and **Decline** |
| `changed` | "This changed since the request: …", then each changed value with what the requester saw and what the check read today; or, for a `requires` rule or a missing `requiredExpect` name, that one sentence; no buttons |

Every sentence is in `src/ui/stepper-words.ts`.

Each new view is compared with the one before (`src/ui/stepper-changes.ts`): its results are said
through one status region that is on the page from the start, and when the pressed control went
away with the change, focus moves to the title, GitHub's code, the next browser step or the done
step's line (`action-steppers.results`).

## Example

```tsx
<ActionStepper view={view} actions={stepperActions} />
```
