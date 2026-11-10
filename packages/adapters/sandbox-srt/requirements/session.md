# sandbox-srt.session

- Status: active
- Since: 0.1.0
- Source: HAL-193 (plan phase 3, v1.17), HAL-2554, HAL-188, HAL-3011, HAL-3188, HAL-3493

The sandbox-srt adapter shall open a session that proves its fence before anything runs (a canary file the fence hides and a loopback port it blocks), start programs only inside a proven fence and never a file under a skill's `scripts/` folder (as the program, an argument or the folder it starts in, as written or through a symbolic link), give each session its own private settings folder, give the launcher outside the fence only the host's absolute PATH and TMPDIR, set the profile's environment (never a proxy variable) only inside the fence on top of the proxy variables sandbox-runtime sets there, so the program reaches the bridge and nothing else on the host, and stop the program and everything it started on `kill`, `close`, the time limit or an aborted signal, and when the session ends undo any `commondir` file the program added, changed or deleted in the working folder's git folder or its linked worktrees, never following a link the program put in place of the git folder, its `worktrees` folder or a worktree folder (the link is removed and the folder recreated), and move aside the `.git` of each gitlink in the working folder's index (its shared index too, when the index is split) that the program added, made or changed, including a submodule that had no `.git` at session start (recorded at start, so it counts even when the program takes it out of the index), never following a link on the way to it and reporting the index when it or its shared index can't be read (not when the working folder's `.git` is a file, as in a linked worktree or a submodule, where only the `commondir` check applies), and reporting each as a refused write (and `close()` rejecting, naming them, when one could not be undone). Undoing them after a host crash is not covered here (HAL-3496).

## Examples

- Given a fence that lets a program read the canary file,
  when a session is opened,
  then the fence is `not-fenced` with a reason and `start` throws.
- Given a host with `HTTPS_PROXY` set,
  when a program is started,
  then neither the program nor the probe sees a proxy variable.
- Given a bridge on a loopback port and another service on a second loopback port,
  when a program in the session asks both through the fence's proxy,
  then it reaches the bridge and not the other service.
- Given a bridge on `10.0.0.5`,
  when a session is opened,
  then opening fails and nothing runs.
- Given a time limit of five seconds and a program that never ends,
  when the limit runs out,
  then the program is killed with the reason `timeout` and the session is stopped.
- Given a session with a proven fence,
  when `start` is asked to run `node skills/mail/scripts/send.js`,
  then it throws and nothing is started.
- Given a link `innocent` in the working folder that leads to `skills/mail/scripts/send`,
  when `start` is asked to run `./innocent` or `sh innocent`,
  then it throws and nothing is started.
- Given any caller of the srt runner,
  when it asks the runner to run `node skills/mail/scripts/send.js`,
  then the runner throws and starts no process.
- Given a working folder with a git folder,
  when a program writes `.git/commondir` and the session closes,
  then the file is gone again and a refused write is reported.
- Given a working folder whose `.git/worktrees/feature` the program replaced with a symbolic link to a folder outside it,
  when the session closes,
  then nothing outside the working folder changes and the link is replaced by a folder.
- Given a `commondir` the program changed and a worktree folder that cannot be written,
  when the session closes,
  then a refused write is reported and `close()` rejects naming the file.
- Given a submodule in the index with no `.git` at session start,
  when a program writes `docs/.git` (a file pointing at its own folder, or a folder) with a `core.fsmonitor` setting and the session closes,
  then `docs/.git` is moved aside to `docs/.git.halonic-blocked`, a refused write is reported, and the user's next `git status` runs nothing.
- Given a working folder whose index is split, or that a program splits,
  when a gitlink sits only in the shared index (`.git/sharedindex.<id>`) and the program plants its `.git`,
  then that `.git` is moved aside too, and when the shared index is missing, `.git/index` is reported as a refused write.
