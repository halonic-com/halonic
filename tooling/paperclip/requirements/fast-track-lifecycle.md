# paperclip.fast-track-lifecycle

- Status: active
- Since: unreleased
- Source: HAL-17774; the board's decision and Liam's design on HAL-17772 (supervision loops as Halonic workflows plus pure rule functions); Liam's layer decision on HAL-18009 (core packages only); plan HAL-15997

When a `pr-watch` pass has taken a company's GitHub snapshot, the plugin shall, in dry run and only while this worker holds the company's engine lease in plugin state, run the `fast-track` workflow (ready, review, approved, queued, merged, closed; review moves on to `review_late` after 15 minutes) on the workflow engine with its run logs, blobs and timers in plugin state: deliver the timers that are due, work out each `fast-track` pull request's stage and actions with the lifecycle rule from a compact input, start a run for a pull request that has none that lives (again after an interrupted one), send it its stage as the event `stage`, log each other action through the executor of its kind once per task, pull request, head and action, forget the runs that ended, and write nothing to Paperclip or GitHub.

## Examples

- Given a `fast-track` pull request that is a draft, then ready for review, then approved, then approved and green for 15 minutes, then in the merge queue, then merged,
  when a pass runs at each step,
  then its run goes ready, review, approved, queued and merged, the pass asks the reviewer to review once, logs a queue request once, and forgets the run after the merge.
- Given a `fast-track` pull request ready for review and not approved,
  when a pass runs 16 minutes after its run entered review,
  then the run is in `review_late` and the pass tells the board once; 14 minutes after, it doesn't.
- Given a pull request whose run ended as interrupted,
  when a pass runs,
  then it starts a new run and moves it straight to the stage the snapshot shows.
- Given another worker's lease that hasn't run out,
  when a pass runs,
  then it runs nothing; once that lease has run out, it takes the lease over.
