# cli.commands.stepper.guide

- Status: active
- Since: unreleased
- Source: board decision on HAL-10, 24 Nov 13:21 UTC; architecture note on HAL-17491, section 7.8; task HAL-17550

When `halonic stepper guide <file>` runs, the CLI shall validate the file as a `halonic.stepper-request/1` document against this Halonic's stepper catalog and, when it validates, print its manual guide from `renderManualGuide` (`action-steppers.manual-guide`), one line per guide line, with `--json` giving it as `guide`, and exit with 0. When the request doesn't validate, it shall print no guide, print "✕ Couldn't print the manual guide: the stepper would refuse this request, …" with every reason on its own line, each naming its block, give them as `reasons` with `--json`, and exit with 2. A missing file, a folder or an unreadable file shall get its own reason and exit with 2. Until `core/action-catalog` ships (HAL-17518) the catalog is empty, so only a `server-session` request validates.

## Examples

- Given `request.json` whose block 1 is a `step` naming `github.delete-repo@1`, which isn't in the catalog,
  when `halonic stepper guide request.json` runs,
  then it prints a reason starting `block 1:` and exits with 2.
- Given a `server-session` request for the task `HAL-1234`,
  when `halonic stepper guide request.json` runs,
  then it prints the request's title and a numbered list ending with reporting back on `HAL-1234`, and exits with 0.
- Given no file `missing.json`,
  when `halonic stepper guide missing.json` runs,
  then it says there's no file `missing.json` and exits with 2.
