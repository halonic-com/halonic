# app.doctor-mxc

- Status: active
- Since: 0.1.0
- Source: HAL-3306; docs/adr/2026-11-10-mxc-sandbox-backend.md ("Known limits", "What Studio and the CLI get"); the plan on HAL-3292. The words wait on the design on HAL-3290.

Where the computer offers MXC, `halonic doctor` shall have an MXC line with MXC's state from the sandbox choice, whether the person chose MXC and, when it can't run or its trust check failed, its reason code, with the sentences behind it kept apart for `--debug`. While MXC is in use, the line shall say whether name lookups leave the box. Any state but `in-use` shall be marked as failed when the person chose MXC, because their steps don't run then. A failed trust check of an MXC nobody chose shall be a warning, and every other state shall be ok. Where MXC isn't offered, or isn't one of the backends, there shall be no MXC line.

## Examples

- Given MXC chosen and a trust check that failed with `too-strict`,
  then the line is ✕ with `too-strict`, and `doctor` exits 1.
- Given MXC chosen and `setup-needed`,
  then the line is ✕ with `setup-needed`.
- Given MXC not chosen and a trust check that failed with `port-reachable`,
  then the line is ! with `port-reachable`.
- Given MXC in use, with name lookups leaving the box,
  then the line is ✓ and says that name lookups leave.
- Given MXC `available` and not chosen,
  then the line is ✓ with that state.
- Given a computer that doesn't offer MXC,
  then there is no MXC line.
