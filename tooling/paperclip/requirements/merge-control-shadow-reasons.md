# paperclip.merge-control-shadow-reasons

- Status: active
- Since: unreleased
- Source: HAL-18345 (from HAL-18324, item 3: four of six "missed" PRs were timing races)

While merge control is in `shadow` mode, the plugin shall keep, for each enqueue only one side made, why the other side didn't: for one only merge control decided, the kind of the Merger's newest queue-manager note on that head, or "no note"; for one only the Merger made, merge control's gate and wait reasons on the newest pass that saw the pull request out of the queue on that head, or "late, agrees" when merge control's gate and wait rules passed within 5 minutes of the Merger's enqueue; and the daily diff shall list these reasons and count "late, agrees" apart from the Merger's other enqueues.

## Examples

- Given a pull request whose gate and wait rules passed on a pass at 11:59,
  when the Merger enqueues it at 12:00 before merge control decides it,
  then the diff counts it as `late, agrees` and not under "Only the Merger did".
- Given merge control decides to enqueue #41 and the Merger's newest note on its head says GitHub shows it as blocked,
  when the diff is posted,
  then it lists `enqueue #41 (Merger's note: blocked)` under "Only merge control would have done".
- Given merge control's newest pass that saw #42 out of the queue said `ci-ok missing on head 004200aaa`,
  when the Merger enqueues #42 and its gate still doesn't pass,
  then the diff lists `enqueue #42 (merge control: ci-ok missing on head 004200aaa)` under "Only the Merger did".
