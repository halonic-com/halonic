# services.action-steps

- Status: draft
- Since: unreleased
- Source: HAL-17526, HAL-18125; architecture note on HAL-17491 (1.3, 4.1, 4.2)

When the Studio runs in the desktop shell, a workspace's services shall have the action steps the stepper screen calls, which run a request's steps through the Tauri action sender over the shell's `action_*` commands and write what happened to the request's record through the Tauri action records over the shell's `action_record_append` and `action_record_read`: `action.signed-in` with the account's name after a sign-in, `action.step.started` before a call step is sent or once the shell is asked to open a guided step's page, also when it refuses to, followed then by `action.step.failed` with `refused`, then `action.step.succeeded` with the status and kept fields for a 2xx answer, or `action.step.failed` with `service-error` (and the status and the service's message), `refused` or `unreachable`. A step the user cancels in the shell's dialog shall leave only its `action.step.started`. A request whose record has its `action.finished` shall run and open nothing more and answer `closed`. Outside the shell, the action steps shall run, open and sign in to nothing, write nothing, and answer every run with `desktop-only`, for which the stepper screen says "Open it in the desktop app to run it."

## Examples

- Given the Studio served to a browser,
  when the user runs step 1 of a request,
  then the answer is `desktop-only`, no command is called and the request's record stays empty.
- Given the desktop app, signed in to GitHub as `acme-dev`,
  when the user runs step 1 of an `acme/app` variable request,
  then the shell receives `action_send` with that step, and `action_record_append` with `action.step.started` and `action.step.succeeded`.
- Given a request the user declined, so its record ends with `action.finished`,
  when step 1 is run again,
  then the answer is `closed` and nothing is sent.
