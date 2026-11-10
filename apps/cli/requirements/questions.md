# cli.questions

- Status: active
- Since: 0.1.0
- Source: HAL-2184; the CLI output design on HAL-1981 (cli-output sections 1.7 and 1.8, and the checklist item "Questions" in section 5), approved by the board on HAL-2123

The `halonic` command shall ask a yes-or-no question only when stdin is a terminal, `CI` isn't set (or is `0` or `false`) and `--json` isn't given. It shall ask with the question followed by "[y/N]" on stderr, and take only "y" or "yes", in any case, as yes; anything else, an empty line or the end of stdin shall be no. When it may not ask, it shall ask nothing and refuse with the command's own error, which names the flags that answer the question. When the command's `--yes` answers the question, it shall ask nothing, print nothing in its place and take the answer as yes, also in a terminal and with `--json`.

## Examples

- Given a terminal,
  when the command asks whether to trust Acme,
  then it writes "Trust Acme on this computer? [y/N] " and an answer of "y" is yes.
- Given a terminal,
  when the user presses Enter without typing,
  then the answer is no.
- Given `CI=true`, or stdin that isn't a terminal, or `--json`,
  when the command needs an answer,
  then it asks nothing and refuses with its error.
- Given `--yes`, in a terminal or with `--json`,
  when the command needs an answer,
  then it asks nothing, reads nothing from stdin and takes the answer as yes.
