# shell.welcome-start

- Status: active
- Since: unreleased
- Source: HAL-13412; HAL-14950 (C513 M11, Liam on #4253); first-run-progress revision 4 (HAL-7986), sections 2, 3.2, 5, 8 and 9, approved by the board on 19 Nov (HAL-7993); Maya's wording pass (HAL-13414); Sofia on HAL-13428; Owen's `start_status` (HAL-13408, HAL-14633)

When the app gives the welcome screen Halonic's start, the welcome screen shall show it under **Open demo** and **Open folder**. While the start waits, it shall show the kit's waiting line "Starting Halonic…" with the shell's seconds, from 2 seconds; at 10 seconds the line shall add "The first start takes longer than the next ones." and **Something wrong?**, which opens Check this computer; from the shell's `still_starting` that sentence shall read "Still starting. The first start unpacks Halonic's files, which can take up to a minute." From the moment the line shows, it shall keep room for the longer of its two sentences and **Something wrong?** at any width, so their coming moves nothing under it. From 2 seconds, and while the start has failed, **Open demo** and **Open folder** shall be off, pointing at the line under them, "Open demo and Open folder work once the engine is running." ("Open folder works once the engine is running." without the demo). A press on **Open demo**, **Open folder** or a Recent row before the start is ready shall keep that button busy and run once the start is ready, or end without running when it fails or the welcome screen goes away. When the start fails with a cause other than `wsl_missing`, `distro_missing` or `runtime_missing`, the screen shall show a danger Callout titled "Halonic's engine didn't start" with the cause's sentence: `timed_out` "Halonic waited a minute and got no answer from its engine. Nothing ran, and your files weren't changed. Try again, or check this computer to see why."; `missing` and `broken` "Some of Halonic's files are missing or damaged. Reinstall Halonic, then open it again."; `blocked` "Something on this computer blocked Halonic from starting, such as an antivirus program. Allow Halonic, then try again."; `stopped` "Halonic's engine stopped while it was starting. Try again. If it happens again, copy the report and send it with your question."; `wsl_failed` "WSL didn't answer when Halonic started its engine. Restart Windows, then try again."; and `other`, or a cause it doesn't know, "Halonic's engine couldn't start. Nothing ran, and your files weren't changed. Try again, or check this computer to see why." The Callout shall offer **Try again**, which starts again, **Check this computer** and **Copy report**, and shall take focus when it shows. The screen shall never show the cause's id or the exit code; only the copied report holds them. `wsl_missing`, `distro_missing` and `runtime_missing` shall count as ready: the sandbox isn't set up yet, and the demo doesn't use it. When the start is ready after the line or the failure showed, a polite status region shall say "Halonic is ready" once; a start that is ready within 2 seconds shall show and say nothing. When Try again takes the failure away, focus shall go back to the leading button. Without the start, the welcome screen shall show none of this.

## Examples

- Given the shell answers `starting` at 1 second,
  then the screen shows no waiting line, Open demo and Open folder are on, and nothing is said.
- Given the shell answers `starting` at 3 seconds,
  then the screen shows "Starting Halonic…" and "3 s", Open folder is off and points at "Open demo and Open folder work once the engine is running."
- Given the shell answers `starting` at 12 seconds,
  then the line adds "The first start takes longer than the next ones." and **Something wrong?**, and the line's box was already as high at 3 seconds.
- Given the shell answers `still_starting` at 34 seconds,
  then the sentence reads "Still starting. The first start unpacks Halonic's files, which can take up to a minute."
- Given the shell answers `failed` with `stopped` and exit code 137,
  then the Callout reads "Halonic's engine didn't start" and the `stopped` sentence, it has focus, the screen doesn't show "137", and Copy report puts "cause stopped · exit code 137" on the clipboard.
- Given the shell answers `failed` with `distro_missing`,
  then the screen shows no failure and Open demo and Open folder are on.
- Given the user presses Open folder at 1 second,
  when the shell answers `ready`,
  then the folder picker opens.
- Given the screen showed the waiting line,
  when the shell answers `ready`,
  then the line goes and the status region reads "Halonic is ready".
