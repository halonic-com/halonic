# workspace.trust-check-lines

- Status: active
- Since: unreleased
- Source: Iris's flow check C544 (HAL-15117): a row's label and its text ran together

When the trust check shows a line under a row, such as **Gets secrets** or **Without asking**, it shall put a colon after the label, so the label and its text read apart.

## Examples

- Given a program row with the line **Gets secrets** `ACME_TOKEN`,
  when the person opens the check,
  then the line reads "Gets secrets: ACME_TOKEN".
