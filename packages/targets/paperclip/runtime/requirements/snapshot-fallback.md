# runtime.snapshot-fallback

- Status: active
- Since: unreleased
- Source: HAL-17949, step 1a of the phase 3 plan on HAL-17450 (rev 5, "How the plugin reads the workspace"); Liam on HAL-17451 (only what CI built: pinned commit, checksum, green check) and on HAL-17985 (the runtime is a generic package)

While its settings pin no snapshot, a plugin built with the runtime shall serve the snapshot built into it; when its settings pin one, it shall serve the snapshot from the pinned commit only once the workspace check on that commit is green, the file's sha-256 is the pinned one, the snapshot names that commit and it passes every check `readSnapshot` runs, and keep it as the last good snapshot; when the pinned snapshot can't be loaded or is refused, or the pin is incomplete, it shall keep serving the last good snapshot, or the built-in one, unchanged, write how many minutes it has been stale, and try the same pin again at most every 10 minutes; and a plugin whose built-in snapshot is missing or refused shall serve no tools.

## Examples

- Given a plugin whose settings pin no snapshot,
  when an agent calls one of its tools,
  then it serves the built-in snapshot and sends no request for a snapshot.
- Given a pin on commit `1111…` of `acme/workspace-acme` whose `ci-ok` is green and whose snapshot file has the pinned sha-256,
  when an agent calls a tool twice,
  then the first call loads and keeps that snapshot and the second sends no request for it.
- Given the same pin while the workspace check on `1111…` is red,
  when an agent calls a tool,
  then it serves the built-in snapshot, writes a stale metric, and doesn't ask GitHub again for that pin for 10 minutes.
- Given a pinned snapshot file with another sha-256, one built from another commit, or one with a key in a description,
  when the plugin loads it,
  then it refuses it whole and keeps serving the last good snapshot.
- Given GitHub down after the board pins a newer commit,
  when an agent calls a tool,
  then the last good snapshot is served unchanged.
- Given a plugin without a `snapshot.json` next to its worker,
  when it starts,
  then it logs why and every tool answers that it is off.
