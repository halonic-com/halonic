# paperclip.merge-control-culprit-hold

- Status: active
- Since: unreleased
- Source: HAL-17703; the merge controller ADR (HAL-17700); MERGER.md §4 rule 13 and §6; #4445; Chief, HAL-10, 24 Nov; HAL-17884; HAL-17925; HAL-18340 (#5969, 25 Nov)

When a merge-group CI run of the last 3 hours failed, or was cancelled with a failed job, and GitHub has taken its pull request out within the hour, the plugin shall hold that pull request until it has a new head, also when main is recorded as broken (`paperclip.merge-control-main-broken`), unless the hold was lifted for that head or the runner hook refused its jobs (`paperclip.merge-control-hook-refused`), and shall comment once naming the failed jobs; a group cancelled without a failed job shall let its pull request back in once per pull request.

## Examples

- Given a failed group whose pull request is out of the queue,
  when two passes run,
  then it is held on its head, the comment names `Test (core)` once, and a new head lifts the hold.
- Given a failed group whose pull request is still queued,
  when a pass runs,
  then nothing is held and the run is looked at again next pass.
- Given a cancelled group without a failed job,
  when it happens twice,
  then the first lets the pull request back in and the second holds it.
- Given #5969's group 45566729803 failing only on files it doesn't change, with `main`'s push run red,
  when a pass runs and, after the freeze ends, another one,
  then main is recorded as broken, #5969's head is held all the same, and it isn't added again on that head.
