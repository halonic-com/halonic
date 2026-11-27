# studio-click-test.harness-model-step

- Status: active
- Since: unreleased
- Source: HAL-18930, the review of #6711: a user-visible Studio requirement comes with a click step (`docs/guides/checks.md`, HAL-18716)

When the steps of `studio-click-test.try-it-steps` have run, the click test shall open Writer's page in the demo, set Configuration › Harness to Codex, pick the demo's test model `default` on the Model page, and pass when the page shows "This model can't be used with Codex. Choose another." (`agents.configuration.harness-model`), read from the agents feature's words file. Whether that sentence shows or not, it shall then set Writer's harness back to Halonic, and fail as `NOT_BACK_ON_HALONIC` when it can't. A step that can't reach a control shall fail with its code: `NO_WRITER`, `NO_CONFIGURATION`, `NO_CODEX`, `NO_MODEL_PAGE` or `NO_TEST_MODEL`, and `NO_REFUSAL` when the sentence doesn't show.

## Examples

- Given the demo's Writer, whose model the Model page checks against Codex,
  then the step passes and leaves Writer on Halonic.
- Given a Model page that shows no sentence for Codex,
  then the step fails as `NO_REFUSAL`, and still sets Writer back to Halonic.
- Given a Harness page without Halonic's option once Codex was picked,
  then the step fails as `NOT_BACK_ON_HALONIC`.
