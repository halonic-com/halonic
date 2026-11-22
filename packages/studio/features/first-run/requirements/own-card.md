# first-run.own-card

- Status: draft
- Since: unreleased
- Source: HAL-14646 (UX check L6, HAL-12721); the board on HAL-12723; flow-first-run 5.2; first-run-progress 3.1; ux-acceptance-rows L6.1–L6.6

While the open workspace isn't the sample and no first run is on in it, the First Run feature shall fill Home's Get set up section with the line "*N* of 3 done" above three steps in the kit's setup rows: **Connect your own model**, with the hint "Until then, agents use the test model, which repeats your message back."; **Make your first agent**; and **Run it once**, done by the rules of `first-run.own-progress`, which also says when the card shows and when it's gone. When all three are done, the card shall end with the line "You're set up. Get set up won't show here again." under the steps. While not done, step 1 shall open Models with the `default` alias open, step 2 shall open New agent, and step 3 shall open the last listed agent's page, and before there's an agent do what step 2 does; a done step's row shall do nothing. While step 1 asks a local provider whether it answers, its row shall show the waiting line "Checking *name* at *address*…" and give up after 5 seconds; when the provider doesn't answer, the row shall show the problem "*name* isn't answering at *address*. Start *name*, or add an API key for a cloud model." with **Check again**, which asks again, and **Open Models**. When a file, the agents, the runs or a key can't be read, the section shall show its error with Try again.

## Examples

- Given a new workspace, on the test model with no agent and no runs,
  when Home opens,
  then Get set up reads "0 of 3 done" and lists the three steps, numbered.
- Given a workspace whose card showed with steps left in an earlier visit, and all three done now,
  when Home opens,
  then Get set up reads "3 of 3 done", ticks the three steps and ends with "You're set up. Get set up won't show here again."
- Given the Acme sample,
  when Home opens,
  then Get set up shows nothing.
- Given a workspace with no agent,
  when step 3 is opened,
  then New agent opens.
- Given `default` on a local Ollama that doesn't answer within 5 seconds,
  when Home opens,
  then step 1 reads "Ollama isn't answering at localhost:11434. Start Ollama, or add an API key for a cloud model." with Check again and Open Models.
