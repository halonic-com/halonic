# cli.run-live-version

- Status: active
- Since: 0.1.0
- Source: HAL-3246 (save model 2.2–2.3, routing note task 2), plan approved by Liam on HAL-3246; the words from Sofia on HAL-4850 (cli-output 3.4); the recorded version from HAL-6021 (`app.run-records-its-version`)

When `halonic run` starts a workflow, the command shall start it from the workspace's live version, the latest commit, through `runSourceFor("run", …)` (`app.runs-read-latest-version`), so a saved change that isn't in a version yet isn't used. A workspace whose folder isn't a git repository has history off, and the command shall start the saved files then, without needing git. The run's `run.started` shall record the version it started: the live version's commit and date, or the saved files with history off. When the folder is a repository with no commit yet, nothing is live: the command shall start nothing, write nothing to the run log and end with the `conflict` kind (exit 5), with line 1 "Nothing is live yet, so there is nothing to run. Nothing ran." and the fix "Make a first commit in git, then run again.". The trust check and the sandbox check before the run shall be on the version it starts, not on the saved files. When the folder is a repository but git can't start, such as when it isn't installed, the command shall not fall back to the saved files: it shall start nothing and end with the `unavailable` kind (exit 9), with line 1 "git can't start on this computer, so the live version can't be read. Nothing ran." and the fix "Install git and make sure it's on your PATH, then try again."; git's own reason shows only with `--debug`.

When `halonic run` starts the live version and a definition file differs from it, changed, added, removed or renamed since the latest commit, staged or not, the command shall print the dimmed line "Your uncommitted changes aren't used. Commit them to run them." before the run's heading (HAL-6007). Files no kind places, such as a connector's script, a README or the `--input` file, don't count, because the run doesn't read them from the live version. With history off, or with nothing changed, there is no such line.

When `halonic runs send` answers a waiting run, the command shall check trust and the sandbox on the same version `halonic run` would start; while nothing is live yet, on the saved files, so a waiting run can still be answered. When git can't start, it refuses as `halonic run` does, with "Nothing was sent." in place of "Nothing ran.". The run's own steps come from the definitions it kept when it started, never from either.

## Examples

- Given a workspace in git whose latest commit has Support reply, and a saved change to it that isn't committed,
  when `halonic run support-reply` runs,
  then the run starts Support reply as committed, not the saved change.
- Given the same workspace with the saved change to Support reply,
  when `halonic run support-reply` runs,
  then it prints "Your uncommitted changes aren't used. Commit them to run them." before the heading.
- Given a workspace in git with nothing changed since the latest commit, or only its `examples/refund-question.json` changed,
  when `halonic run support-reply` runs,
  then there is no line about uncommitted changes.
- Given a workspace in git whose latest commit was made on 11 November at 10:42,
  when `halonic run support-reply` runs,
  then the run's `run.started` records `{ reads: "live-version", commit: <that commit>, versionDate: <its date> }`; in a folder that isn't a git repository, `{ reads: "saved-files" }`.
- Given a workspace folder that isn't a git repository,
  when `halonic run support-reply` runs,
  then it starts the saved files, as before.
- Given a workspace folder that is a git repository with no commit,
  when `halonic run support-reply` runs,
  then it says "Nothing is live yet, so there is nothing to run. Nothing ran." and "Make a first commit in git, then run again.", exits 5 and stores no run.
- Given a workspace folder that is a git repository with a commit, on a computer where git can't start,
  when `halonic run support-reply` runs,
  then it says "git can't start on this computer, so the live version can't be read. Nothing ran." and "Install git and make sure it's on your PATH, then try again.", exits 9 and stores no run.
