# app.doctor-last-run

- Status: draft
- Since: unreleased
- Source: HAL-13406; first-run-progress 4.2 and 4.3 (the Last run line; the heading counts causes), with Noah's cause ids of revision 3, accepted by Liam on HAL-13406

When the host gives the workspace's last run and that run failed, the doctor's report shall hold a Last run line for Studio: the run's id, the step it stopped at and how many steps the run has, the step's and agent's names for the screen, how long it ran, its failure facts, and a cause id that names the line the cause belongs to (`<line id>.<reason>`). A key that isn't stored shall be `models.no-key`, a server on this computer that doesn't answer `models.unreachable`, a cloud model refused by Local only through `default` `default-model.local-only`, and a sandbox that isn't ready `sandbox.<code>`; any other failure shall be `last-run.<reason>`. When a line above shows the same cause, the Last run line shall name that line, so Studio counts the cause once. A cancelled run shall get no line. `halonic doctor` shall not print the line, and it shall not count in the summary.

Each line shall also name the actions Studio offers on it, by id: `review-trust` on a Workspace line that isn't trusted, `test-again` on the Models line and `open-models` with it while the line has a problem, `pick-model` on a Default model line that uses a provider, and `open-run` on the Last run line. No other line shall offer one.

## Examples

- Given the last run stopped at step 2 of 3 because Anthropic's key isn't stored, and the Models line names that key,
  then the Last run line has the cause `models.no-key` and names the Models line.
- Given the last run was refused by Local only through `default`, and the Default model line has that cause,
  then the Last run line has the cause `default-model.local-only` and names the Default model line.
- Given the last run failed because the provider had no credit,
  then the cause is `last-run.out-of-credit` and no line above is named.
- Given a Workspace line that isn't trusted yet,
  then its action is `review-trust`.
