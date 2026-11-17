# sandbox-srt.kept-grants

- Status: active
- Since: unreleased
- Source: HAL-5882, HAL-5884, HAL-6256, HAL-5398

When a session on Windows ends (a normal close, an abort, the time limit, or an open that fails after the fence probe ran), the sandbox-srt adapter shall run `srt-win acl forget` on its working and temp folders, unless another live session of the same host still uses the folder, because srt keeps a write grant on both that wins over a deny inherited from a parent folder. It shall also, once after the host starts and before its first open, forget the kept grants inside the sweep roots it was given that no live session of the host uses; without a sweep root it shall list nothing and forget nothing. It shall do this only through one module that wraps the `srt-win` command line, and only for versions of sandbox-runtime it was tried against: for any other version it shall refuse to open a session, with a clear error. Before srt can grant anything on a session's working and temp folders, the adapter shall write them to a record file of its own host process in the profile (next to the host lock), and shall open no session when the record can't be written; only a successful `acl forget` takes a folder out of the record. The sweep shall also forget the recorded folders of host processes that are gone, wherever they are, but never touch the record of a process that still runs, and never forget a folder that record lists, even inside a sweep root; a recorded folder srt doesn't list holds no grant, so it is only dropped from the record. A removal of the sandbox leaves the records, which the next sweep drops. A folder another live session still uses shall not count as a failure. When forgetting fails, `close()` shall reject naming the folders and the reason, and a failure of the sweep or of a failed open shall be logged; none shall pass silently.

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
- Given a host process that crashed after it recorded a folder and srt granted it, outside the sweep roots,
  when the host that holds the profile's lock sweeps,
  then that folder is forgotten and taken out of the record.
- Given a recorded folder that srt does not list,
  when the sweep runs,
  then `acl forget` does not run for it and it leaves the record.
- Given two live host processes on one profile,
  when each records a folder,
  then each writes only its own record file, and neither sweep touches the other's.
- Given a record that can't be written,
  when a session is opened,
  then opening fails with a sentence naming the record file.
- Given Linux or macOS,
  when a session closes,
  then `srt-win` is never started.
