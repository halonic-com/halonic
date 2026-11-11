# sandbox-srt.kept-grants

- Status: active
- Since: 0.1.0
- Source: HAL-5882, HAL-5884

On Windows, srt keeps a write grant on each session's working and temp folders after the session ends, and that grant wins over a deny inherited from a parent folder. The sandbox-srt adapter shall therefore run `srt-win acl forget --unless-held-by-others` on both folders whenever a session ends (a normal close, an abort, the time limit, and an open that fails after the fence probe ran), and, once per host start, forget the kept grants inside the run folder it was given that no live session holds. It shall do this only through one module that wraps the `srt-win` command line, and only for versions of sandbox-runtime it was tried against: for any other version it shall refuse to open a session, with a clear error. A grant that another live session holds shall not count as a failure. When forgetting fails, `close()` shall reject naming the folders and the reason, and a failure of the sweep or of a failed open shall be logged; none shall pass silently.

## Examples

- Given a session on Windows,
  when it closes,
  then `acl forget <folder> --unless-held-by-others` ran for its working folder and for its temp folder.
- Given a session whose time limit runs out, or whose signal aborts,
  when it ends,
  then both folders were forgotten too.
- Given `srt-win` fails on a folder,
  when the session closes,
  then `close()` rejects and names the folder and the reason.
- Given a folder another live session holds,
  when a session closes,
  then `close()` resolves.
- Given a version of sandbox-runtime that was not tried,
  when a session is opened,
  then opening fails with an error that names the version.
- Given kept grants inside and outside the run folder, one of them held by a live session,
  when the sweep runs,
  then only those inside the run folder are forgotten, and the held one stays without an error.
- Given Linux or macOS,
  when a session closes,
  then `srt-win` is never started.
