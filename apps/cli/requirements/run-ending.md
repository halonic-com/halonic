# cli.run-ending

- Status: active
- Since: unreleased
- Source: HAL-16276, from Iris's flow check C692 (HAL-16271), item 4: after a rejection the CLI said only "finished", while the run page names the ending (`runs.run-view.receipt-ending`, HAL-14592); the same words, decided by the team under the HAL-2282 rule; the `runs` list's What column from HAL-16449 (C705 finding 1 on HAL-16418 and C710 finding 3 on HAL-16446: a rejected run was listed as "✓ Done … Sent nothing")

When a finished run of a workflow with more than one final state ends its output, in `halonic run`, `halonic runs send` and `halonic runs show` alike, the CLI shall name the ending it reached on the line under the receipt, indented as the receipt is, "Ending: _ending_", where _ending_ is the final state's step name: the first line of its description, else its id. A workflow with one final state or none shall get no Ending line, and a failed, stopped or waiting run shall get none either. The status in the `runs` list stays "Done" whatever the ending, as the run page's badge does, and the row's What column shall start with the same "Ending: _ending_", followed by what the run sent and its estimated cost, so a rejected run doesn't read as one that sent its reply.

## Examples

- Given a Support reply run waiting at Approve this reply?,
  when `halonic runs send 01jd8q reject` is run,
  then its output ends with "✓ Support reply finished in 1 s.", "  Sent nothing · asked you once" and "  Ending: Finished without the reply".
- Given the same run answered with approve,
  when `halonic runs show 01jd8q` is run,
  then "  Ending: Finished with the reply approved" follows the receipt.
- Given a run of a workflow whose only final state is `done`,
  when it finishes,
  then its output has no Ending line.
- Given a Support reply run answered with reject that sent nothing,
  when `halonic runs` is run,
  then its row reads "✓ Done", "Support reply" and "Ending: Finished without the reply · sent nothing".
