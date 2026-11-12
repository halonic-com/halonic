# sandbox-srt.kept-grants

- Status: active
- Since: 0.1.0
- Source: HAL-5882, HAL-5884, HAL-6256

When a session on Windows ends (a normal close, an abort, the time limit, or an open that fails after the fence probe ran), the sandbox-srt adapter shall run `srt-win acl forget` on its working and temp folders, unless another live session of the same host still uses the folder, because srt keeps a write grant on both that wins over a deny inherited from a parent folder. It shall also, once after the host starts and before its first open, forget the kept grants inside the sweep roots it was given that no live session of the host uses; without a sweep root it shall list nothing and forget nothing. It shall do this only through one module that wraps the `srt-win` command line, and only for versions of sandbox-runtime it was tried against: for any other version it shall refuse to open a session, with a clear error. A folder another live session still uses shall not count as a failure. When forgetting fails, `close()` shall reject naming the folders and the reason, and a failure of the sweep or of a failed open shall be logged; none shall pass silently.

## Examples

- Given a session on Windows,
  when it closes,
  then `acl forget <folder>` ran for its working folder and for its temp folder.
- Given a session whose time limit runs out, or whose signal aborts,
  when it ends,
  then both folders were forgotten too.
- Given `srt-win` fails on a folder,
  when the session closes,
  then `close()` rejects and names the folder and the reason.
- Given two sessions of the same host on one working folder,
  when the first closes,
  then that folder is not forgotten and `close()` resolves, and it is forgotten when the second closes.
- Given a version of sandbox-runtime that was not tried,
  when a session is opened,
  then opening fails with an error that names the version.
- Given kept grants inside and outside two sweep roots, one of them used by a live session,
  when the sweep runs,
  then only those inside a root are forgotten, and the used one stays without an error.
- Given Linux or macOS,
  when a session closes,
  then `srt-win` is never started.
