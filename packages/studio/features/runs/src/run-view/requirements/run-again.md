# runs.run-view.run-again

- Status: active
- Since: unreleased
- Source: HAL-1308 (T15) PR 6b; decision by Liam on HAL-11049 (Run again moves into T15; the banner's button is part of the fifth local-model case); HAL-12406 (one Run again on the page, decided by Sofia on HAL-12440)

The **Run again** button on the run page shall start a new run of the same workflow with the input the run's `run.started` logged, on what is saved in the workspace now, and open the new run's page once it has started.

It shall be the last button of a failed (danger) banner that offers it, and otherwise a button in the page's header, never both. A failed banner offers it when it has no button of its own. It shall be there only for a real run that has ended (completed or failed), whose log is read, and when the app can start runs: a test run, a run of a single agent, a run that is still going or waiting, and a page without an engine (a served page) have none.

When the run doesn't start, the page shall say "Couldn't start the run: *reason*" in a danger banner under the header, announce it, and stay on the run. The reason is the same as for a failed load of a run: a host that says the engine can't be reached gives its "isn't answering" in the words for where Studio runs, and any other failure gives its own reason, or "Halonic ran into a problem it can't explain yet." with **Copy details** (microcopy 22 F13). Every reason reads on after the colon: one that starts with a common word such as "The" goes on in lower case, and any other first word, which may be a name such as Halonic, Ollama or an agent's, keeps its capital.

Limits, for the docs: the failed banner still has room for one button. **Open Models** and **Copy command** come with the local-model banners. A run that started with an input the workflow no longer accepts fails to start, and the page says why.

## Examples

- Given a failed real run of `support-reply` whose log started with the input `{"message":"Hi"}`,
  when **Run again** is pressed,
  then the host starts `support-reply` with that input and the page opens the new run.
- Given a failed real run and a host that rejects with the workflow's reason "The workflow changed.",
  when **Run again** is pressed,
  then the page shows "Couldn't start the run: the workflow changed.", says it, and stays on the run.
- Given a failed real run and a desktop shell that gives no answer to the run call,
  when **Run again** is pressed,
  then the page shows "Couldn't start the run: the desktop shell gave no answer to the run call."
- Given a failed real run on a phone and a host that says the engine can't be reached,
  when **Run again** is pressed,
  then the page shows "Couldn't start the run: Halonic on your computer isn't answering."
- Given a failed real run and a host that rejects with an error that has no reason of its own,
  when **Run again** is pressed,
  then the page shows "Couldn't start the run: Halonic ran into a problem it can't explain yet." with **Copy details**.
- Given a real run that failed with `provider-busy`,
  when its page is shown,
  then there is one **Run again**, the failed banner's last button, and none in the header.
- Given a real run that completed, or that stopped at its budget,
  when its page is shown,
  then there is one **Run again**, in the header.
- Given a run that is still running, a test run, or a page with no start host,
  when its page is shown,
  then there is no **Run again**.
