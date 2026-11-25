# studio-click-test.step-requirements

- Status: active
- Since: unreleased
- Source: HAL-18716 point 2 (the board's yes, 25 Nov), HAL-18862

Each click test step shall name, in its step file, the repo's requirement ids it checks on the installed app, at least one, each the id of a requirement file in the repo that isn't retired. The results table shall show a step's ids in a Requirements column, next to its title, whatever its verdict.

## Examples

- Given the Messenger step names `messenger.not-connected`,
  then its row in the table reads `messenger.not-connected` under Requirements.
- Given a step that names `messenger.no-such-thing`, or no requirement at all,
  then the package's own tests fail.
