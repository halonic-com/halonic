# shell.welcome-lite-check

- Status: active
- Since: unreleased
- Source: HAL-13412; first-run-progress revision 4 (HAL-7986), sections 3.2, 4.2 to 4.4 and 9, approved by the board on 19 Nov (HAL-7993); Maya's wording pass (HAL-13414); Sofia on HAL-13428; Owen's `lite_check` (HAL-13408)

When the user presses **Check this computer** or **Something wrong?** on the welcome screen's start, the shell shall open the dialog **Check this computer** with Halonic's version and system under its title, run the app's lite check at once and show "Checking this computer…" in a status region until it answers. It shall then show one line per check, each with an icon and its state in words for screen readers ("Engine, problem: Not running"): **Engine** ("Running", "Still starting", or "Not running" as a problem; "Not running, because of the problem below" as info when a line below is a problem, so one cause counts once); **Halonic's files** ("All there", or "Some are missing or damaged. Reinstall Halonic, then open it again." as a problem); **Profile folder** ("Halonic can write to it", "Halonic can't write to it. Check that your account can change files in your home folder." as a problem, or "Couldn't check: Halonic couldn't find it" as info); **Disk** ("Enough free space", "Low on disk space: _n_ GB free" as a warning, or "Free space unknown. Halonic couldn't read the free space on this drive." as a warning); on Windows one **Sandbox** line ("Set up" when the distro and its runtime are there, "Couldn't check" as info when either is unknown, else "Not set up yet. The demo doesn't need the sandbox." as info, never a problem); and last **Not checked**, "The engine's checks, because the engine isn't running", never as passed. The status region shall then read the heading once, counting problems and warnings: "1 problem", "No problems · 1 warning", "No problems". **Check again** shall run the check again. **Show the report** shall unfold exactly what **Copy report** copies: "Check this computer", the version and system, the time, the heading and each line with its glyph (✓ ✕ ! –), plus the cause id, the exit code and the seconds of a failed start, and never a path, a name or an error message. A Copy report on the welcome screen's failure shall copy the same report, with the lite check's lines when it has run, else the line "Not checked: Halonic's files, profile folder and disk, because Check this computer wasn't run". When the lite check can't run, the dialog shall show that line ending "because the check couldn't run" in place of its lines. **Close** and Escape shall close the dialog. The dialog shall change nothing and send nothing.

## Examples

- Given the start failed with `timed_out` after 60 s and the lite check finds everything there on macOS,
  then the dialog shows "1 problem", Engine "Not running" with a ✕, Halonic's files, Profile folder and Disk with a ✓, and "Not checked" last, and the report's Engine line reads "✕ Engine          Not running · cause timed_out · after 60 s".
- Given the lite check answers `app_files` `missing`,
  then Halonic's files is the one problem, Engine reads "Not running, because of the problem below" as info, and the heading reads "1 problem".
- Given Windows, where the lite check answers `wsl_distro` `missing` and `wsl_runtime` `not_checked`,
  then the Sandbox line reads "Not set up yet. The demo doesn't need the sandbox." as info, and it isn't counted.
- Given the lite check answers `disk_space` `low` with 600,000,000 free bytes,
  then Disk reads "Low on disk space: 0.6 GB free" as a warning.
- Given Copy report on the failure before the dialog was opened,
  then the report holds the Engine line and "Not checked" for Halonic's files, profile folder and disk.
