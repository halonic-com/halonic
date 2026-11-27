# action-steppers.changed-after-start-run

- Status: active
- Since: unreleased
- Source: HAL-20258, a follow-up from the security review of #6721 on HAL-17520; requirements `action-steppers.changed-after-start` and `action-catalog.github-set-actions-secret`

When a request's `check` step names a `changedAfterStart` field and its read has succeeded, the stepper shall judge what the check kept with `checkChangedAfterStart` against the time Studio recorded on the first `action.step.started` of the nearest `guided` step before it that wasn't refused, taken only from the request's own record and recorded before that read. Where the judgement fails, no such start is recorded, or the user marked the check done by hand, the stepper shall show the check as failed with the judgement's message, "Open the page from this stepper first, then check again." when there is no start, or "Halonic has to read this on the service, so it can't be marked done by hand. Run the check instead." for a check marked by hand; it shall not end the request as succeeded, shall offer the check again, shall show a guided step whose page it never opened as to do again while the request can still run, so the user can open it, and shall list the check once in the answer, as failed with `state-changed`, if the user stops there or the request's `expect` stops it. Studio's clock decides the start and the first opening is kept, so a computer clock that runs behind GitHub's lets an update from just before the page opened pass, and one that runs ahead when the page opens fails every save made within that lead, even after the clock is put right.

## Examples

- Given `github.set-actions-secret@1` for `DEPLOY_TOKEN` on `acme/app`, whose page opened at `2026-11-27T09:00:00Z`,
  when the check keeps an `updated_at` of `2026-11-27T09:03:41Z`,
  then the request ends succeeded.
- Given the same page opening,
  when the check keeps an `updated_at` of `2026-11-26T18:30:05Z`,
  then the request doesn't end succeeded and the check shows "It hasn't changed since this stepper opened."
- Given the same page opening,
  when the check keeps an `updated_at` of `2026-11-27T25:00:00Z`,
  then the check shows "The service gave no valid time in "updated_at"."
- Given no guided-step start in the record,
  when the check runs,
  then it shows "Open the page from this stepper first, then check again."
- Given step 1 marked done by hand without opening its page,
  when the check runs,
  then step 1 shows as to do again and the check shows "Open the page from this stepper first, then check again."
- Given the check marked done by hand,
  when the request shows,
  then the check shows "Halonic has to read this on the service, so it can't be marked done by hand. Run the check instead."
