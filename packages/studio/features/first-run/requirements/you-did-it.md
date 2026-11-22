# first-run.you-did-it

- Status: active
- Since: unreleased
- Source: HAL-13435 (first-run build 7); first-run-flow 3.5, "You did it" (HAL-7985); `inbox.answered-view`, `runs.sample-chip`; Liam's plan review on HAL-13435 (the path from the run's own log)

When the person approves the wait card of the first run's run in the open folder (`first-run.state`) and the run finishes, the First Run feature shall replace the card in the Inbox with "You did it" (`inbox.answered-view`): the title "Your first run is done.", which takes focus, then one line with the run's real step count, the time it took, its cost part and "logged with your yes", such as "3 steps · 14 s · no cost, ran on this computer · logged with your yes". The cost part shall follow the run's model path from its own log (`runs.sample-chip`): with a key, the run's cost as the Runs list words it, or none when it had no price; on a model on this computer, "no cost, ran on this computer"; on Sample answers, none, with the line "Sample answers. Add a key or a local model to use a real model." under it. Under "What next?" it shall offer **Run it again with your own message**, which opens Support reply's page, or on Sample answers **Pick a model** in its place, which opens the `default` model's tab; then **Change what the agents do** "(open a file, or ask the chat)", which opens Support reply's page. Then the line "Later: connect Gmail or Google Drive. About 15 minutes, once. It's in Settings when you want it." and **Close**, which leaves the Inbox's pane empty. Until the run's record has it finished and its path is read, the line and the next steps shall be replaced by a loading line. A Reject, an answer on another run, or an Approve that doesn't finish the run shall keep the card's decided bar.

## Examples

- Given the first run waits in Acme on a model on this computer after 3 steps and 14 s,
  when the person approves its card and the run finishes,
  then the card is replaced by "Your first run is done." with "3 steps · 14 s · no cost, ran on this computer · logged with your yes".
- Given the same run on Sample answers,
  when the person approves it,
  then the line reads "3 steps · 14 s · logged with your yes", the sample line shows, and **Pick a model** comes first under "What next?".
- Given the same run on Anthropic that cost €0.02,
  when the person approves it,
  then the line reads "3 steps · 14 s · estimated cost €0.02 · logged with your yes" and **Run it again with your own message** comes first.
- Given the first run's card,
  when the person rejects it,
  then the card says "Rejected by you at 10:44." and no "You did it" shows.
- Given a run of Support reply from before the first run began,
  when the person approves its card,
  then the card keeps its decided bar.
