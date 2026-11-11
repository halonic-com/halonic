# cli.run-view

- Status: active
- Since: 0.1.0
- Source: HAL-2742, HAL-3650 and HAL-5052; the CLI output design on HAL-1981 (cli-output section 3.4, "Finished: the receipt" and "`halonic runs show <run-id>`", revisions 17 to 38), approved by the board on HAL-2123; a workflow step whose child runs again from HAL-6173

When the `halonic` command shows what a run did, it shall build it from the run's log alone: one line per step the run reached, in order, with its mark, its name and what ran it (the agent's name and model alias, after the subagent's name and "for" when a subagent's tool call waits for the user's OK), lined up in columns, and the receipt. A finished or failed step shall end with how long it took; a wait step the user answered shall say what they answered and when; the step a run is in shall say since when it runs or waits. The workflow's end state and steps the run didn't reach shall get no line. The receipt shall say "sent nothing" only for a run that made no tool call, shall count each time the run asked the user, and shall leave the cost out when no call had a price.

## Examples

- Given an Acme run that read the email, drafted a reply, waited and got `approve` at 14:02,
  when its steps are shown,
  then they read "✓ Read the email Writer · smart 1 s", "✓ Draft a reply Writer · smart 9 s" and "! Approve this reply? you approved at 14:02".
- Given an Acme run whose step Classify it failed after 1 second,
  when its steps are shown,
  then the last line reads "✕ Classify it Sorter · fast 1 s".
- Given an Acme run in the step Draft a reply since 10:53,
  when its steps are shown,
  then the last line reads "◌ Draft a reply Writer · smart · running since 10:53".
- Given an Acme run in the workflow step Get it approved since 10:53, whose child run waited and runs again,
  when its steps are shown,
  then the last line reads "◌ Get it approved running since 10:53".
- Given an Acme run waiting at Approve this reply? since 10:41,
  when its steps are shown,
  then the last line reads "! Approve this reply? waiting for you since 10:41".
- Given an Acme run whose step Draft a reply waits for the user's OK on a tool call its agent Writer's subagent Sorter asked for,
  when its steps are shown,
  then the last line reads "! Draft a reply Sorter, for Writer · smart".
- Given a run that made no tool call, asked the user once and cost €0.004,
  when its receipt is made,
  then it reads "Sent nothing · asked you once · estimated cost €0.004".
- Given a run on the test model that made a tool call,
  when its receipt is made,
  then it has no sent part and no cost.
