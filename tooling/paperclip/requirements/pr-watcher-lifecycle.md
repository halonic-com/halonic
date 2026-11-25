# paperclip.pr-watcher-lifecycle

- Status: active
- Since: unreleased
- Source: HAL-18197 (plan HAL-17450 rev 5, "Step 2"; the HAL-17774 engine host; Liam's design on HAL-17772)

When a `pr-watch` pass has run the `pr-watcher` signal rule for a company, the plugin shall, in dry run and only while this worker holds the company's engine lease, run the `pr-watcher` workflow (open, merged, green, done, closed) on the workflow engine with its run logs and timers in plugin state: work out each watched pull request's stage with a pure lifecycle rule from its state, whether `ci-ok` passed on the merge and whether the signal rule marks its task done, start a run for a pull request that has none that lives, send it its stage as the event `stage` (never a stage before the run's own), forget the runs that ended and those whose pull request the watcher hasn't read for 7 days, and write nothing to Paperclip or GitHub.

## Examples

- Given a watched pull request that is open, then merged, then merged with `ci-ok` green, then marked done by the signal rule,
  when a pass runs at each step,
  then its run goes open, merged, green and done, and the run is forgotten after done.
- Given a run in `merged`, when a pass sees the pull request open, then the run stays in `merged`.
- Given a pull request first seen closed, when a pass runs, then it gets no run.
- Given a run whose task the watcher skips, when a pass runs 6 days later, then the run is kept; after more than 7 days, it is forgotten.
