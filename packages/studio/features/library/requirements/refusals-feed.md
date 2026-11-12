# library.refusals-feed

- Status: active
- Since: 0.1.0
- Source: HAL-1063; Sofia's layout review (HAL-7814); Tomas (HAL-7856)

The Library feature shall keep the refusals that chat turns report in memory, for each connector, newest first, never more than 20 for one connector, and shall stamp each with the time it arrived. Refusals shall be kept only since Halonic started. The status view shall show the time of each refusal next to its line.

## Examples

- Given a chat turn that reports two refusals from the source "notes",
  when they are recorded,
  then "notes" has two refusals, the later one first, each with the time they arrived.
- Given 21 refusals from one source,
  when they are recorded,
  then the source keeps the newest 20.
- Given a chat turn that reports no refusals,
  when it is recorded,
  then nobody who watches the feed is called.
