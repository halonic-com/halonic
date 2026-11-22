# cli.commands.validate.integration-sheet

- Status: active
- Since: unreleased
- Source: HAL-15751, from Nina's flow check C619 (HAL-15734, item 2)

When `halonic validate` checks a workspace with a local integration whose `integrations/<folder>/integration.yaml` doesn't parse as an integration sheet, such as a secret with hosts and no `as`, it shall list each of the sheet's own problems on that file, with its line, column, message and code, as it lists a workspace file's, and fail. This holds whether or not the workspace is local only, so the error a local-only workspace gives the connector ("Connector "notes" isn't local, and the workspace is local only: the sheet of its integration in integrations/notes can't be read, …") has a line beside it that says why. A sheet that parses shall get no problem from this, and one that can't be read at all is left to the integration's start.

## Examples

- Given a workspace that isn't local only, with a sheet in `integrations/notes` whose secret `notes-key` has `hosts` and no `as`,
  when `halonic validate` is run,
  then it lists an error on `integrations/notes/integration.yaml`, at the secret's line, and exits 1.
- Given the same sheet in a local-only workspace with a `local: true` connector to it,
  when `halonic validate` is run,
  then it lists the connector's "can't be read" error and the sheet's own error on the sheet's file.
- Given the same sheet with `as: bearer`,
  when `halonic validate` is run,
  then it finds no problems.
