# runs.run-view.run-again

- Status: active
- Since: 0.1.0
- Source: HAL-1308 (T15) PR 6b; decision by Liam on HAL-11049 (Run again moves into T15; the banner's button is part of the fifth local-model case)

The **Run again** button on the run page shall start a new run of the same workflow with the input the run's `run.started` logged, on what is saved in the workspace now, and open the new run's page once it has started.

It shall be a button in the page's header, and the button of a failed (danger) banner that has no button of its own. It shall be there only for a real run that has ended (completed or failed), whose log is read, and when the app can start runs: a test run, a run of a single agent, a run that is still going or waiting, and a page without an engine (a served page) have none.

When the run doesn't start, the page shall say "Couldn't start the run." with the reason, in a danger banner under the header, and stay on the run. The reason is the engine's own words, the same as a failed load of a run; the engine isn't answering is said in the page's words.

Limits, for the docs: the failed banner still has room for one button. **Open Models** and **Copy command** come with the local-model banners. A run that started with an input the workflow no longer accepts fails to start, and the page says why.

## Examples

- Given a failed real run of `support-reply` whose log started with the input `{"message":"Hi"}`,
  when **Run again** is pressed,
  then the host starts `support-reply` with that input and the page opens the new run.
- Given a failed real run and a host that rejects with "The engine isn't answering.",
  when **Run again** is pressed,
  then the page shows "Couldn't start the run." and the reason, and stays on the run.
- Given a run that is still running, a test run, or a page with no start host,
  when its page is shown,
  then there is no **Run again**.
