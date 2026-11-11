# cli.version

- Status: active
- Since: 0.1.0
- Source: HAL-6000, decided by Liam (CLI owner) for the 0.1.0 source install; found on HAL-5994

The `halonic` command shall take `--version` anywhere before a `--`, as an option every command takes. With it, the CLI shall print "Halonic" and Halonic's version from `src/version.ts` on one line on stdout, run no command, and exit with 0. With `--json`, stdout shall instead be one JSON document with `outputVersion` 1, `ok` true and `version`. After a `--`, `--version` shall be an argument like any other.

## Examples

- Given `halonic --version`,
  when it runs,
  then it prints "Halonic 0.1.0" and exits with 0.
- Given `halonic --version --json`,
  when it runs,
  then stdout is one document with `outputVersion` 1, `ok` true and `version` "0.1.0", and it exits with 0.
- Given `halonic greet Ada --version`,
  when it runs,
  then it prints "Halonic 0.1.0" instead of greeting and exits with 0.
