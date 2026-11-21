# studio.start-watch

- Status: active
- Since: unreleased
- Source: HAL-13412; first-run-progress revision 4 (HAL-7986), section 3.2; Owen's `engine_ready`, `start_status` and `lite_check` (HAL-13408)

When the desktop app starts, it shall call the window's `engine_ready` once, because in 0.1 the engine runs in the page, and then ask `start_status` once a second and give each answer to Welcome (`shell.welcome-start`), until the start is ready; a failed start shall be asked on, because a host that starts late still turns it ready. **Try again** shall call `engine_ready` again and ask at once, and an answer to an older try shall be dropped. **Check this computer** shall call `lite_check`. When the window can't answer `start_status`, or answers something else, the start shall read as ready and the app shall stop asking, so Welcome is never held up by the watch itself. When the window closes, the app shall stop asking. The report shall name Halonic's version and the system: "Halonic 0.1.0 · macOS".

## Examples

- Given the window answers `starting`, `starting`, then `ready`,
  then the app asks three times, one second apart, and then stops.
- Given the window answers `failed` with `timed_out`, then `ready`,
  then Welcome gets the failure and a second later the ready start.
- Given a window without `start_status`,
  then the start reads as ready and nothing is asked again.
