# Decision: the CLI scrubs loaded secrets from every error it prints

- Approval: HAL-2308
- Kind: internal

`cli.print-error` gains one sentence and one example: every line `printError`
writes has the secrets a command loaded through the CLI's `Secrets` replaced
with "[secret removed]". Nothing is removed from the requirement. It makes the
rule from cli-output 1.3 (rule 5) true: `--debug` prints a bug's text "with
secrets scrubbed". Liam approved the plan on HAL-2308.

## Covers

- cli.print-error
