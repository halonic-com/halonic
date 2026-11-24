# cloudflare-storage.run-list-metadata

- Status: active
- Since: unreleased
- Source: selling layer S1-4 (HAL-13216); design 13.7 (an organisation's admin exports run metadata only, HAL-13272)

The D1 run list's `metadata` shall give, for every run of the list's own scope and of no other, its id, the id of whoever started it, its visibility, its status and its start time in UTC, newest start first and then by id, and nothing of its events or summary.

Rationale: an organisation's admin may export what runs there are without their content, so the export needs a run's row without its events.

## Examples

- Given two runs under `u/eu_a`, one completed, when the metadata is read, then it gives both, the later start first, each naming `eu_a` as the starter, `private`, and its status.
- Given a run under `o/org_a`, when the metadata of `o/org_ab` is read, then it is empty.
