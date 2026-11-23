# cloudflare-durable.no-storage-on-read

- Status: active
- Since: unreleased
- Source: HAL-17127; selling layer design, section 3.2 (HAL-12483)

When a run object that was never written is read, cancelled or woken by its alarm, the run object shall answer as an empty run and shall create no tables and set no alarm, so a run id of another scope, or one that never existed, gets the same answer and leaves nothing behind. The run object shall create its tables on its first append or schedule.

Rationale: a read that stores something would let anyone fill storage with made-up ids, and the answer could differ between a foreign run and one that never existed.

## Examples

- Given a run object never written, when its events, snapshot, summary, health and timers are read, then it answers `[]`, `null`, `null`, no last event and `[]`, and it has no tables.
- Given a run object never written, when a run is appended, then its tables exist and hold the events.
