# app.runner-fence

- Status: active
- Since: 0.1.0
- Source: HAL-3385; the I5 design on HAL-958 (4.2, 4.3); the "Runs" line design on HAL-1873 (sections 2 and 11, Julian's build condition (b)), approved by the board on HAL-1949

The fence status of plugin and integration code shall be `not-fenced` with the reason `windows` on Windows, whatever the sandbox check and the fence proof say; elsewhere `not-fenced` with the sandbox check's reason when the check fails, `stopped` when the check passed but the session's fence proof didn't, and `fenced` otherwise. Its reasons shall be one list of their own, so a reason only plugin and integration code has can be added without changing the sandbox's.

## Examples

- Given Windows, a passing sandbox check and a passing fence proof,
  then the status is `not-fenced` with `windows`.
- Given Windows and a failing sandbox check with `other`,
  then the status is still `not-fenced` with `windows`.
- Given Linux and a check that fails with `container`, `user-namespaces-restricted`, `bubblewrap-missing`, `linux-tools-missing` or `other`,
  then the status is `not-fenced` with that reason.
- Given macOS or Linux and a passing check, before the code starts,
  then the status is `fenced`.
- Given a passing check and a fence proof that is `not-fenced` or `stopped`,
  then the status is `stopped`, never `not-fenced`.
- Given a passing check and a passing fence proof,
  then the status is `fenced`.
- Given the reasons,
  then they are every reason the sandbox check can give.
