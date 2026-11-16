# Decision: native srt on Windows lists its static limits

- Approval: HAL-5398 (https://paperclip.halonic.com/HAL/issues/HAL-5398), approved by the board; the package owner (Liam) signs this note
- Kind: internal
- Signature: pending
- Task: HAL-5398

## What changes

The closed list of limit codes gains `reads-open-by-default` and `wsl-service-reachable`, as the approved design (HAL-3779, section 3) names them. Native srt on Windows lists `project-folder-writable`, `name-lookups-leave`, `reads-open-by-default`, `wsl-service-reachable` and `schannel-tls-fails`. `kept-roots-readable` is no longer a static limit there: it is a residual of an `ok` check (HAL-10598, S4). The ADR table now uses the design's name `reads-open-by-default` (it said `user-files-readable`). No requirement text changes, no test was weakened or skipped.

## Why

The design lists these limits for native srt, and S4 made `kept-roots-readable` dynamic, so showing it as static would report it when Halonic's own setup does not have it.

## Covers

- agent-host.sandbox-choice-routes
