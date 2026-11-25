# harness-kit.session-settings-folder

- Status: active
- Since: unreleased
- Source: HAL-18179 (B1b-1 of the plan on HAL-18020), design approved on HAL-18239

Where a harness's program runs on a disk that isn't this computer's, such as a Cloudflare container, the harness kit shall write the program's files through the sandbox session, with each operation a fixed `sh` script that takes its path as an argument and a file's text on its standard input, never as part of a command. It shall reach only the profile's settings folder and temp folder: a path outside them, a relative path, or one with an empty, `.` or `..` part shall be refused before anything starts, and so shall writing or removing either folder itself. In the sandbox, each script shall first refuse a path with a symbolic link among its parent folders inside those two folders, so a link the program made can't send a write or a removal elsewhere; the path itself may be a link, which is written or removed, never what it points to. A file shall be written aside in its own folder and then renamed into place, and a write that fails shall leave nothing aside. A read of a missing file shall give `null`, a read of a file over 1 MiB shall fail, and a script that fails shall fail the operation with the end of its error output.

Rationale: the program's machine is reachable only through the session, and the writer removes folders, so a wrong path must never reach the working folder or the root. The text of a path isn't enough for that: the program can make links in its temp folder, so the folders on the way are checked in the sandbox, just before each operation.

## Examples

- Given a session whose settings folder is `/halonic/home/.claude`, when `settings.json` is written there and read back, then the read gives its text and the folder holds no temporary file.
- Given the same session, when `/work/notes.md` or `/halonic/home/.claude/../../../work` is removed, then the writer refuses it and starts nothing.
- Given a settings folder holding `.credentials.json` and `old.md`, when it is listed, then both names come back.
- Given a folder that can't be written, when a file is written there, then the write fails and leaves no temporary file.
- Given a link in the temp folder that points to `/work`, when `notes.md` is removed or written through it, then the writer refuses it and `/work` keeps its files; removing the link itself removes only the link.
