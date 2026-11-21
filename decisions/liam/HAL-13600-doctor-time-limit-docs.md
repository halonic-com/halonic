# Decision: doctor's report requirement names the line for a check that ran out of time

- Approval: Paperclip task HAL-13600, a team decision with no board card (HAL-2282 rule: it records
  wording already approved and merged in HAL-13405). Liam wrote it, so Julian signs this note as the
  security reviewer
- Kind: user-visible

Since HAL-13405 (#3937), `halonic doctor` prints `! <Check>  didn't answer in 5 seconds` for a check
that doesn't answer within the time limit `app.doctor-time-limit` sets. The requirement
`cli.doctor-report` didn't say so. It now has one sentence for that line, one new example (the
sandbox and harness checks time out, the summary is "No problems. 2 warnings."), and HAL-13405 in its
Source line. Nothing else in the requirement changes.

`doctor-report.time-limit.test.ts` is now wrapped in `verifies("cli.doctor-report", …)`. Its
assertions are unchanged. No test was skipped or deleted. The `halonic doctor` row in
`apps/cli/README.md` and a patch changeset for `@halonicjs/app-studio` describe the same line.

## Why

The behaviour shipped without the requirement, docs and changeset that describe it, so the release
notes would miss it and the test checked wording no requirement recorded.

## Covers

- cli.doctor-report
