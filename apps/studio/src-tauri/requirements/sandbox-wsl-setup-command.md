# studio.src-tauri.sandbox-wsl-setup-command

- Status: draft
- Since: unreleased
- Source: HAL-16765 (scope, PR 2), HAL-16771; the one-shot's flags and answer are HAL-16770's

When the page calls `sandbox_wsl_setup`, the shell shall start the `halonic-agent-host.exe` beside the app once, without a console window, with `--wsl-setup`, `--profile-folder` and the profile's folder, `--wsl-image` and the `halonic-wsl.tar.gz` beside the app, and `--wsl-resume` and the app's own program, quoted, and take no path, argument or folder from the page. It shall answer `{ outcome: "image_missing" }` and start nothing when that image isn't there, and refuse the call when the host it starts doesn't run in Halonic's WSL distro. It shall read the last line the setup prints as its answer, wait at most five minutes, leave a setup still running then to finish and answer `timed_out`, and answer `still_running`, starting nothing, while an earlier setup runs. When the setup is done it shall start the host in the distro, which installs the runtime beside the app, and answer `done`, or `failed` with the start's sandbox reason. It shall answer the setup's other endings as `restart_needed`, `cancelled`, `failed` with the port's reason and the setup's own code, `not_started` or `unanswered`, with what it said only as `details`; a setup that refused the shell's flags, or that broke (`error`), shall answer `failed` with the reason `other` and the code it refused with, or `error`. `sandbox_wsl_setup_offered` shall answer true only on Windows when the host the shell starts runs in Halonic's distro. Both shall be granted to the app's own local main window on Windows only, never to the Studio the computer serves, and on other systems `sandbox_wsl_setup` shall refuse the call.

## Examples

- Given the setup prints a notice, then `{"outcome":"failed","code":"distro-not-ours","reason":"other","detail":"…"}`,
  when the page calls `sandbox_wsl_setup`,
  then the answer is `{ outcome: "failed", reason: "other", code: "distro-not-ours", details }`.
- Given the setup prints `{"outcome":"error","detail":"…"}`,
  when the page calls `sandbox_wsl_setup`,
  then the answer is `{ outcome: "failed", reason: "other", code: "error", details }`.
- Given a setup still running after five minutes,
  when the page calls `sandbox_wsl_setup` again,
  then the answer is `{ outcome: "still_running" }` and no second setup starts.
- Given the setup is done and the runtime install into the distro fails,
  when the shell starts the host,
  then the answer is `{ outcome: "failed", reason: "runtime-missing", details }`.
- Given the Studio the computer serves,
  when it calls `sandbox_wsl_setup`,
  then the shell refuses it as not allowed.
