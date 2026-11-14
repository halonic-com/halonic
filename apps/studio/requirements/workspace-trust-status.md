# studio.workspace-trust-status

- Status: active
- Since: 0.1.0
- Source: states-flow-map 2.7 P4 to P6, P9 and P10 (HAL-5878), flow-workspace 6.1; HAL-1291

The desktop app shall tell the workspace page where the open workspace stands, from the same check as the header badge: nothing before the first answer, `trusted` with the day the person trusted it, `changed` with the day they trusted the earlier version, `list-unreadable` when the list of trusted workspaces can't be read, `failed` with the reason when the check itself couldn't run (and a way to run it again), and `not-trusted` otherwise. The header badge shall word a changed workspace "Changed since you trusted it" with **Review changes**, and a failed check "Couldn't load workspace settings" with **Try again**. Removing a person's trust shall forget the record for exactly this folder, check again, and leave the workspace not trusted. When nothing was read yet, or the record can't be forgotten, it shall save nothing and say why.

## Examples

- Given a workspace the person trusted,
  then its status is `trusted` with the day it was trusted.
- Given the person removes trust,
  then the record is gone and the status is `not-trusted`.
- Given the workspace was never read,
  then removing trust says "Halonic hasn't read this workspace yet".
