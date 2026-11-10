# app.doctor-sandbox

- Status: active
- Since: 0.1.0
- Source: HAL-2270; cli-output 3.7 and 3.8 (the Sandbox line, worded from the code); Mateo on HAL-2246 (no Halonic setup command)

The Sandbox line of `halonic doctor` shall be marked as ok, with the sandbox's capabilities, when the sandbox's check finds it can start. When the check finds it can't start, the line shall be marked as failed and carry the check's reason code, from which the command line words the reason and the fix. The check's own sentences about what is missing shall be kept apart from the reason, for `--debug` only.

## Examples

- Given the sandbox's check is ok and its fence is the operating system's,
  then the line is ✓ with that strength.
- Given bubblewrap isn't installed,
  then the line is ✕ with `bubblewrap-missing`, so `doctor` exits 1.
- Given the check fails with `other` and says "seccomp is unavailable",
  then the line is ✕ with `other`, and that sentence is only the debug detail.
