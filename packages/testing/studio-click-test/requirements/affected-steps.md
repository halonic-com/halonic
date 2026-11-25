# studio-click-test.affected-steps

- Status: active
- Since: unreleased
- Source: HAL-18716 point 3 (the board's yes, 25 Nov), HAL-18863

When a build of `main` gives the click test the list of paths it changed since the last green build, the click test shall run the short check (the step marked `shortCheck`: the app installs, starts and its engine answers), each step one of whose requirement files, or the folder that holds that requirement's `requirements/` folder, or whose own step file, the change touched, and the steps those need; and it shall name the steps it left out above the results table. When the change touches the suite's other code or its workflow, or no list is given (the nightly run, a run by hand), it shall run every step.

## Examples

- Given a change only to `packages/studio/features/messenger/src/view.tsx`,
  then the build runs "The engine answers" and "Messenger shows its empty state", and the table says Connect Paperclip wasn't run.
- Given a change only to `docs/guides/checks.md`,
  then the build runs only "The engine answers".
- Given a change to `packages/testing/studio-click-test/src/screen.ts`, or no list of changes,
  then every step runs.
- Given a touched step that needs an untouched one,
  then both run.
