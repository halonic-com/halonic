# cli.step-name

- Status: active
- Since: 0.1.0
- Source: the CLI output design on HAL-1981 (cli-output section 3.4, revision 17), approved by the board on HAL-2123; confirmed on HAL-2816

When the `halonic` command names a step of a run, it shall use the first line of the step's description, trimmed, and when the step has no description or its first line is empty, the step's id with only its first letter made a capital.

## Examples

- Given the Acme step `read` with the description "Read the email",
  when it is named,
  then it reads "Read the email".
- Given the Acme step `review` whose description starts with the line "Approve this reply?",
  when it is named,
  then it reads "Approve this reply?".
- Given the step `classify` without a description,
  when it is named,
  then it reads "Classify".
- Given the step `draftReply` without a description,
  when it is named,
  then it reads "DraftReply".
