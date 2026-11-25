# paperclip.merge-control-event-pass

- Status: active
- Since: unreleased
- Source: HAL-18729 (the board's go of 25 Nov via ci-fasttrack on HAL-18424: a pass when an approval or a green `ci-ok` arrives, the schedule stays as the fallback)

When the chief line's `POST /chief-line/pr-event` (`paperclip.chief-line-pr-hooks`) receives a valid signed approval (approved, re-approved, approved again or cache OK) or a `ci-ok` with conclusion `success`, the Agent tools plugin shall start one merge control pass for that company 1 second after the first such event, through the same company-scoped event as the `merge-control` job, and the events until then shall join that pass. It shall do so whether or not pull request outcomes are on; merge control's own mode decides whether the pass reads or writes anything. It shall never run two passes for one company at once: an event-started pass that finds a pass running shall run once after it, while a scheduled pass that finds one running is skipped as before. Without events, passes shall run only on the job's schedule. A changes-requested verdict, a `ci-ok` of any other conclusion and a close shall start no pass.

## Examples

- Given an approval on #6089 arrives, and a green `ci-ok` for #6089 0.4 s later,
  when a second has passed,
  then exactly one merge control pass has run.
- Given no events,
  when the job asks for a pass at 18:20, 18:22 and 18:24,
  then three passes run, at those times.
- Given a scheduled pass that started at 18:20:00 and takes 10 s,
  when a green `ci-ok` arrives at 18:20:02,
  then the next pass starts at 18:20:10, after the first one ends.
