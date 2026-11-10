# cli.progress

- Status: active
- Since: 0.1.0
- Source: HAL-2184; the CLI output design on HAL-1981 (cli-output section 1.5 and checklist item "Progress" in section 5), approved by the board on HAL-2123

The `halonic` command shall show a step that takes a while on one live line of a stream that has live lines: nothing for the step's first second, then "◌" and what the step is doing, and, once the step has waited on the same thing for 10 seconds, also what it's waiting for and for how long. The line shall change only when its words do, with no spinner, shall fit the terminal's width less one column, cut with "…" ("..." when the stream isn't UTF-8) when it is longer, and shall be taken away when the step ends, so the step's finished line takes its place. Any other line written to the screen while the live line is shown shall be written above it: the live line shall be erased, the line written, and the live line drawn again below it. When the command ends, its live line shall be taken away, even when a step didn't end it. A stream without live lines (not a terminal, `TERM=dumb`, `--no-color`, `--json`, or `CI` set) shall get no live line at all.

## Examples

- Given a terminal and a step that ends after 0.8 seconds,
  when it runs,
  then no ◌ line is shown.
- Given a terminal and the step "Draft a reply" that has waited on Anthropic for 12 seconds,
  when the line is drawn,
  then it reads "◌ Draft a reply · waiting for Anthropic (12 s)".
- Given a pipe and a step that takes 30 seconds,
  when it runs,
  then nothing is written for it until its finished line.
- Given a terminal 32 columns wide and the step "Draft a reply" that has waited on Anthropic for 12 seconds,
  when the line is drawn,
  then it reads "◌ Draft a reply · waiting for An…".
- Given a terminal, a step whose live line "◌ Draft a reply" is shown, and the result line "Drafted the reply.",
  when the result is printed,
  then the live line is erased, "Drafted the reply." is written, and "◌ Draft a reply" is drawn again below it.
