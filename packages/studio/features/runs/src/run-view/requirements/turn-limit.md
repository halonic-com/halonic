# runs.run-view.turn-limit

- Status: active
- Since: unreleased
- Source: task HAL-15504 (row 19 of the words check C588 on HAL-15499): microcopy 15.3's row for an agent that used its model call limit, built as written; the facts are `app.run-failure`'s `turn-limit` (HAL-15331), which `halonic run` prints its line from, so the CLI and Studio say the same thing (E4)

When a run failed because an agent used its model call limit, which its cause `engine.turn-limit` names with the agent and the limit, the run page's banner shall say, in the danger tone, "*Sorter* used all *6* model calls in the step *Classify* without finishing.", with the agent as its file names it (its id, with a capital first letter, when the workspace no longer has it), and for a limit of 1 "*Sorter* used its only model call in the step *Classify* without finishing.". Only when the run's facts name the tool its last calls got nothing back from, as the CLI adds it, shall a second sentence follow: "Its last calls to *search_docs* returned nothing.". The banner shall offer **See the step** first, then **Run again**. It shall never show the general banner's "Halonic can't tell the cause yet" for such a run.

## Examples

- Given a run of Support reply that failed in the step Draft with the cause `engine.turn-limit` for the agent `sorter`, named Sorter, and the limit 6,
  when its page is shown,
  then the banner reads "Sorter used all 6 model calls in the step Draft without finishing." with **See the step** and **Run again**.
- Given such a run whose limit is 1,
  when its page is shown,
  then the banner reads "Sorter used its only model call in the step Draft without finishing.".
- Given such a run for the agent `triage-bot`, which the workspace no longer has,
  when its page is shown,
  then the banner begins "Triage-bot used all 6 model calls".
