# services.action-step-records

- Status: draft
- Since: unreleased
- Source: HAL-18164; plan on HAL-17535, approved on HAL-18163; architecture note on HAL-17491 (1.3, 4.2, 6.3)

When the stepper screen records what the shell didn't send, the action steps shall write it to the request's record through `ActionRecords`: a step the user did on the page a guided step opened, or by hand, as `action.step.succeeded` with no status and only what they pasted back as kept fields; a step a check showed was done already as `action.step.skipped`; and the request's end as `action.finished` with its outcome. A request whose record has its `action.finished` shall record nothing more and answer `closed`, so it can't run or end twice. Outside the shell, these calls shall write nothing and answer `desktop-only`.

## Examples

- Given the desktop app and an open request,
  when the user says they set the variable on GitHub's page for step 1,
  then the record has `action.step.succeeded` for step 1 with no status.
- Given a request the user declined, so its record ends with `action.finished`,
  when step 1 is confirmed, skipped or the request finishes again,
  then each answer is `closed` and the record doesn't change.
- Given the Studio served to a browser,
  when the stepper finishes a request,
  then the answer is `desktop-only` and nothing is written.
