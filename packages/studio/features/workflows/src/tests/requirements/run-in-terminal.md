# workflows.tests.run-in-terminal

- Status: draft
- Since: unreleased
- Source: HAL-12725 (first-run check F6, L3, D2 on HAL-12721 and HAL-12714; D-A on HAL-12822); the same pattern as the answer refusal (HAL-12366)

While the app can't run a workflow's tests, the Tests page shall show, where **Run tests** would be, "Studio can't run tests yet. To run them, run this in a terminal:" and the command `halonic test --dir *folder* --filter *hub id*/*workflow id*/` in a CommandBox with **Copy command**, with the command as `app.halonic-command` builds it. The filter ends in `/`, since `--filter` keeps every test whose `hub/workflow/name` contains it, so the workflow `reply` alone would also pick `support-reply`. Where that gives no command, the page shall show only "Studio can't run tests yet.". Once the app can run them, the page shall show **Run tests** and no command.

## Examples

- Given the folder `/acme/Documents/Acme sample`, the workflow `reply` in the hub `acme` with three tests and an app that can't run them, then the page says "Studio can't run tests yet. To run them, run this in a terminal:" with `halonic test --dir "/acme/Documents/Acme sample" --filter acme/reply/` and **Copy command**, and has no **Run tests**.
- Given the folder `\\acme\Acme sample` and an app that can't run them, then the page says only "Studio can't run tests yet." and shows no command.
- Given an app that can run them, then the page has **Run tests** and no command.
