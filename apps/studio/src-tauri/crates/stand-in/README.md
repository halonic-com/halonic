# halonic-stand-in

For tests only, as a dev-dependency: `write_executable` writes a shell script that plays a program the code under test starts (`wsl.exe`, `ssh`, `git`, a git hook) and makes it executable (HAL-14265).

## Why not `std::fs::write`

Linux refuses to run a file that some process still holds open for writing: starting it fails with "Text file busy" (`ETXTBSY`, os error 26). Rust runs the tests of one binary side by side, as threads of one process. If one test writes a script while another test starts a child process, the child gets a copy of the open write handle and keeps it until its own `exec`. Running the script in that moment fails, now and then, in a test that did nothing wrong.

`write_executable` never opens the file in the test process. A short-lived `/bin/sh` writes it, and has exited before the path is handed back, so no handle to it is left anywhere and the script always starts.

On Windows the crate is empty: there the tests write `.cmd` files or start scripts through `sh`, which this race doesn't touch.
