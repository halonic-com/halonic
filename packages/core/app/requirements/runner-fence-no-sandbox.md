# app.runner-fence-no-sandbox

- Status: active
- Since: 0.1.0
- Source: HAL-5397; HAL-3779 design (section 7); extends app.runner-fence

When the person chose to continue without a sandbox, the fence status of plugin and integration code shall be `not-fenced` with the reason `no-sandbox`, whatever the platform, the sandbox check and the fence proof say. The reason `no-sandbox` shall be one of the runner's own reasons, so a saved yes for it is kept apart from the yes for `windows`.

## Examples

- Given Windows and the choice no sandbox,
  then the status is `not-fenced` with `no-sandbox`, not `windows`.
- Given Linux, a passing check and a passing fence proof, and the choice no sandbox,
  then the status is `not-fenced` with `no-sandbox`.
- Given a failing check with `container` and the choice no sandbox,
  then the status is `not-fenced` with `no-sandbox`.
- Given the choice is not no sandbox,
  then the status is the one `app.runner-fence` gives.
