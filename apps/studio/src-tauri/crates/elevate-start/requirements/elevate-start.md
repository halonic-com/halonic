# studio.src-tauri.crates.elevate-start.elevate-start

- Status: draft
- Since: unreleased
- Source: HAL-14841 (Liam's decisions of 21 Nov), HAL-14812

When the shell starts Halonic's sandbox helper, it shall start it with Windows' `runas` verb, owned by the window it is given, with the one argument `setup` or `remove` and nothing else, and wait at most the time limit it is given. It shall answer the helper's exit code when the helper ends in time, `cancelled` when Windows reports `ERROR_CANCELLED` (the person turned the prompt down or closed it), `timed out` when the helper still runs at the limit, and the reason when Windows doesn't start it. It shall never stop a helper that still runs at the limit. While a start runs, or while a helper left running at its limit still runs, it shall answer `still running` without asking Windows again.

## Examples

- Given a helper that exits with 0 within the limit,
  when the shell starts it with `setup`,
  then the answer is exit code 0.
- Given the person turns Windows' prompt down,
  when the shell starts the helper,
  then the answer is `cancelled`, and the next start asks Windows again.
- Given a helper that still runs at the limit,
  when the shell starts it,
  then the answer is `timed out`, and a start while it still runs answers `still running` without asking Windows.
- Given the helper left running at its limit has ended,
  when the shell starts it again,
  then Windows is asked again.
