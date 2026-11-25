# studio.preview-installer-gate

- Status: active
- Since: unreleased
- Source: HAL-18356 (PR C of HAL-18317)

When the Studio preview workflow builds an installer, it shall keep the preview setup `.exe` as the `halonic-studio-preview-windows` artifact only after the click test passed on that build: no installer artifact unless the click test passed on this build. When the click test fails, is skipped or doesn't finish, the run shall keep no such artifact, and the workflow shall offer no way to keep it anyway. The installers the click test installs travel between its jobs as `halonic-installers-<commit>`, its own input; publishing to `halonic-preview` doesn't wait for the click test (`studio.preview-publish`).

## Examples

- Given a preview run whose click test fails at step 1,
  when the run ends,
  then it has no `halonic-studio-preview-windows` artifact.
- Given a preview run whose click test passes,
  when the run ends,
  then its `halonic-studio-preview-windows` artifact holds the preview setup `.exe`.
