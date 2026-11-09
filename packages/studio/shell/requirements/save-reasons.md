# shell.save-reasons

- Status: active
- Since: 0.1.0
- Source: HAL-1668 (FS8), HAL-1729

The shell shall map a write error to a save reason in one function, `saveFailureFor`. When the error's code is `ENOSPC` or `EDQUOT`, the reason shall be `disk-full`. When it is `EACCES`, `EPERM` or `EROFS`, the reason shall be `not-writable`. When it is `EBUSY` or a Windows sharing or lock violation, the reason shall be `in-use`. When the error has any other code or none, the reason shall be `failed`. The shell shall keep the error's code and message with every reason, for Copy details, and shall not put them in the reason.

## Examples

- Given a save that fails with `ENOSPC: no space left on device`,
  when the shell maps the error,
  then the reason is `disk-full` and the details keep `ENOSPC` and the message.
- Given a save that fails with `EBUSY` because another program holds the file on Windows,
  when the shell maps the error,
  then the reason is `in-use`.
- Given a save that fails with `EIO`,
  when the shell maps the error,
  then the reason is `failed`, with `EIO` and the message kept.
