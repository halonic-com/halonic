# Decision: a workspace with file problems fails doctor's Workspace line

- Approval: Liam reviews and approves this note in the review task of HAL-6613; the words are the team's call on that task, built on doctor's Workspace line and run's Couldn't line, so no board card
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:3wa5wTFUYW/as6b3NH7pol7EQ8TNlvwobyzR+Stu0LChnqQOrxaUDNqooci/avbF9xGfSToA0hPaQeH469VRDQ==

`app.doctor-workspace` said the Workspace line is never marked as failed, and
`cli.doctor-workspace` read whether a run is on the test model only from the
loaded workspace alone. Both change.

- `app.doctor-workspace`: while the workspace's files have errors, as
  `halonic validate` finds them, the line is ✕ with how many there are,
  whatever its trust. Otherwise it is never ✕, as before.
- `cli.doctor-workspace`: doctor also reads how many errors the files have,
  and a workspace with any is never on the test model only.

## Why

`loadWorkspace` leaves out a file with an error. With a key pasted into
`providers/anthropic.yaml`, the provider file is left out, so the workspace
looked like the test model only: doctor said "✓ Workspace Acme · test model
only, no trust needed" and `run` started without trust, then failed with the
general lines (Sofia on HAL-6556, item 2 of HAL-6585). `run` now refuses such
a workspace before anything starts (`cli.workspace-file-problems`, new), so
doctor must show it as a problem that stops runs, which is what ✕ means in
doctor.

## Covers

- app.doctor-workspace
- cli.doctor-workspace
