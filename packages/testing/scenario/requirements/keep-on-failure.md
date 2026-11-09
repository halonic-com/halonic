# scenario.keep-on-failure

- Status: active
- Since: 0.1.0
- Source: HAL-1666; Docker research point 7 (HAL-1600), approved on HAL-1649

When a test that called `keepOnFailure(name, collect)` fails, the scenario package shall write what `collect` returned as JSON to `<directory>/<test file>/<test name>/<name>.json`, and add that path to the test's `keptOnFailure` tag. It shall turn the test file and test name into single path segments, so the file is always inside the directory, and shall end a segment with a short hash of the whole name when it had to change or shorten that name, so two tests never write to the same folder. When `collect` throws, the file shall record that error and the test shall keep its own error. When the test passes, it shall write nothing. When `name` isn't lowercase words joined by dashes, or the test already called `keepOnFailure` with that `name`, `keepOnFailure` shall throw.

## Examples

- Given a failing test that keeps `"records"` from a store with one record,
  when the test has failed,
  then `records.json` holds that record and the test's `keptOnFailure` tag names the file.
- Given a failing test named `../../escape / me`,
  when the test has failed,
  then its file is in a folder named `escape-me` and a short hash, inside the directory.
- Given two failing tests whose names share their first 120 characters,
  when both have failed,
  then each one's file is in its own folder and holds its own state.
- Given a failing test whose `collect` throws "store closed",
  when the test has failed,
  then the file records "store closed" and the test's error is still its own.
- Given a passing test that called `keepOnFailure`,
  when it has finished,
  then the directory is empty.
- Given a test that called `keepOnFailure` with `"records"`,
  when it calls `keepOnFailure` with `"records"` again,
  then the second call throws.
