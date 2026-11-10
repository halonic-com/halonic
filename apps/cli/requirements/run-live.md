# cli.run-live

- Status: active
- Since: 0.1.0
- Source: HAL-4056 (plan approved by Liam on HAL-4064, PR 3); cli-output 3.4 ("Live, in a terminal") and 1.5 (HAL-1981)

While `halonic run` follows a run, it shall print the heading as soon as the run starts, and each step's finished line (✓, ✕, or ! for a wait the user answered) as soon as the step ends, before the next step's live line, in the same words the result repeats (`cli.print-ahead`). A step that is still running or waiting shall get no finished line until it ends. The step lines shall be lined up in columns that come from the workflow's definition: each step's name, and what runs it, so a line printed early never needs widening. An end state is no step and shall not count. While a step runs, the command shall show its live ◌ line (`cli.progress`) with the step's name padded to the step column and what runs it, and once it has waited on a model for 10 seconds, the provider's name from its file. A run followed again after an `--event` shall print each finished line once.

## Examples

- Given the Acme example and Sam's email,
  when `halonic run support-reply` has finished Read the email and enters Classify it,
  then `✓ Read the email        Writer   1 s` has been printed, before Classify it's live line starts.
- Given a terminal and the step Draft a reply that has waited on Anthropic for 12 seconds,
  when its live line is drawn,
  then it reads `◌ Draft a reply         Writer · waiting for Anthropic (12 s)`.
- Given `--event approve`,
  when the run is followed again from its first event,
  then "✓ Read the email" is printed once, and `! Approve this reply?   you approved at 14:01` is printed when the run goes on.
