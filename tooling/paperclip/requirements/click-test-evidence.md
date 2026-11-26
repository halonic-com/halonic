# paperclip.click-test-evidence

- Status: active
- Since: unreleased
- Source: HAL-18354 (PR B of HAL-18317: the click test's evidence goes on the task that asked for the build)

When an agent runs `post-click-test.ts <run id> <task>`, the command shall read that run's `halonic-click-test` artifact, attach each step screenshot (`NN-step.png`) to the Paperclip task, and post the run's `results.md` table on the task as one comment, with each screenshot's name linked to its attachment and a link to the run. It shall refuse a run id that isn't a number, a run that isn't trusted (another workflow file than `.github/workflows/studio-preview.yml`, code from another repository such as a fork's pull request, or started by anything but a push or by hand), and a run with no table, and it shall post nothing then. It reads the Paperclip key from the environment only.

## Examples

- Given run 45686461002 with `results.md` naming `01-engine-answers.png` and that screenshot,
  then the comment's row reads `[01-engine-answers.png](<attachment address>)` and ends with a link to the run.
- Given an artifact that also holds `notes.txt`,
  then only the screenshots are attached.
- Given run id `45686461002; rm -rf`,
  then the command refuses it and posts nothing.
- Given a run of the Studio preview workflow from a fork's pull request,
  then the command refuses it and posts nothing.
