# The failure path

How Halonic behaves when something is slow, breaks or runs out. Read it before
you build anything that waits, updates, uses the machine's resources or shows
an error. Reviewers check every pull request in those areas against the
checklist at the end.

Why: the most common complaints about desktop developer tools are not about
features. They are about long waits with no reason, updates that break or wipe
the install, resource use nobody can see, and raw internal errors shown to
users. That is where a tool loses trust, so we design these paths first, not
last.

## The four rules

1. **Every long wait says what it is waiting for.**
2. **An update can roll back, and never deletes user data.**
3. **Resource use is visible.**
4. **Errors are translated before they reach the user.**

These are engineering rules: what the code records and reports. What a user
sees (the words, the screen, where it shows) is a design decision that the
board approves; build it from the approved design, not from this guide.

## 1. Every long wait says what it is waiting for

A long wait is anything that can take more than 1 second: a model reply, a
download, starting the engine or a harness, a sign-in in the browser, a lock
held by another process, an approval, a timer.

- **Report it when it starts**, not after a delay. The report says what is
  awaited (`model reply`, `download`, `sign-in`, …), since when, and if known
  how far along it is (`done` and `total` with a unit) and until when it may
  last.
- **Inside a run, the report is a run event.** `run.waiting` already does this
  for events, timers and child runs; a new kind of wait gets its own field or
  event in `core/events`, with a requirement, not a free-text string.
- **Every step that calls out logs its start**: a model call (`llm.request`),
  a tool call (`tool.called`), and likewise a connector program, a harness and
  the sandbox. A screen can then say what a step has been waiting for.
- **Outside a run** (engine start, updater, workspace load), the wait goes
  through the same channel the window already uses for state, such as the
  shell's `engine.connection`, so Studio and the CLI read one source.
- **Every wait ends.** It has a timeout or a way to cancel it, or both. When
  the timeout passes, it fails with an error kind (see rule 4), never with an
  endless spinner or a hung command.
- **Retries say so.** A retry reports the attempt number and the reason for
  the last failure, so "still waiting" never hides "failing again".
- **Test it with fake timers**: the report is sent before any time passes, and
  the timeout fails with the right kind. Never `sleep` in a test.

## 2. An update can roll back, and never deletes user data

- **User data lives outside the install folder.** Workspaces, run logs,
  settings, saved keys and caches are never under the folder an update
  replaces. An update only replaces the app's own files.
- **No update deletes or rewrites user files by itself.** If a new version
  needs a new file format, it backs up the old file first (next to it, named
  with the old version), then migrates. The backup stays until the user
  removes it.
- **An older version never breaks newer files.** Every file we write carries
  its format version. A version that finds a newer format refuses to change it
  and says why; it doesn't overwrite or "repair" it.
- **A failed update leaves the working version.** A download that stops, a
  signature that doesn't match or an installer that fails changes nothing:
  the current version keeps running.
- **The new version proves it starts.** After an update, the previous version
  stays available until the new one has started once: the engine answers and
  the window opens. If it doesn't, Halonic goes back to the previous version,
  or, where the platform can't do that by itself, keeps the previous installer
  and records in the log how to go back.
- **Update checks are optional.** Blocked or offline update checks never stop
  Studio from working.
- **Test it in the update test** (not written yet: `main` has no updater or
  update test, only the release workflow): the 0.1.0 to 0.1.1 test also checks that a
  workspace, a run log and the settings are byte-for-byte the same afterwards,
  and that a new version that fails to start leaves 0.1.0 working.

## 3. Resource use is visible

- **The engine can report what it uses**, on request and cheaply: its own
  memory, the processes it started (harnesses, sandboxes, MCP servers) with
  their memory, the runs in progress, and the disk space of the data Halonic
  writes (run logs, caches, downloads) per workspace. Token use and cost stay
  in the run summary, where they already are.
- **One function per source** reads each number, and a test covers it with a
  fake source. Nothing polls faster than once a second.
- **`halonic doctor` prints the report**, so it works without Studio and can be
  pasted into a bug report.
- **What we write is bounded.** Every cache and log we keep has a size or age
  limit and a way to clear it. A process we start is stopped when its run ends
  or the engine stops; none outlives the engine.
- **Where Studio shows it** is a design decision for the board.

## 4. Errors are translated before they reach the user

- **Every error that leaves a package has a kind**, from our one short list
  of error kinds (HAL-1663): `invalid_input`, `not_found`, `conflict`,
  `unauthenticated`, `denied`, `limit_reached`, `unavailable` and `internal`.
  The list lives in `packages/core/std` (`requirements/error-kind.md`).
- **Each surface translates in exactly one function**: the HTTP API to a
  status, the CLI to an exit code and a line, Studio to a message. No surface
  shows an error it hasn't translated.
- **The user sees what happened and what to do**, in the words of the approved
  microcopy. Never a stack trace, raw provider JSON, an `errno` code, an
  internal path or an internal name.
- **The detail is kept, not shown.** The original error goes to the log or the
  run log, where `halonic doctor` and a "copy details" action can reach it.
  Detail never contains keys or tokens.
- **Unknown errors are `internal`**, with a message that says something went
  wrong on our side and where the detail is. Never pass an unknown error
  through as text.
- **Test the mapping**: each surface's function has a test per kind, and the
  type system makes a missing kind a compile error.

## Checklist for reviewers

Copy the lines that apply into the pull request description.

- [ ] Every wait longer than 1 second reports what it waits for when it
  starts, and has a timeout or a cancel.
- [ ] Retries report the attempt and the last reason.
- [ ] Waits and timeouts are tested with fake timers.
- [ ] No update path deletes or rewrites user data; format changes back up
  first.
- [ ] A failed update or a failed first start leaves the previous version
  working.
- [ ] New processes, caches and logs are bounded and stopped or cleared.
- [ ] New resource use shows in the engine's report and in `halonic doctor`.
- [ ] Every new error has a kind, and each surface translates it in its one
  function.
- [ ] Nothing shown to the user is a stack trace, raw provider text, an
  internal path or an internal name.
- [ ] Wording and placement that users see come from an approved design.
