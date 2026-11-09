# cli.exit-codes

- Status: active
- Since: 0.1.0
- Source: HAL-187; plan phase 2 (exit code 3 from the trust gate, v1.5)

The `halonic` command shall exit with 0 when it worked, 1 when it ran and found errors or failed, 2 when the command line was wrong, and 3 when the workspace isn't trusted. On a wrong command line it shall print the problem and the command's usage line; on a failure it shall print the error's message after `Error:`.

## Examples

- Given `halonic schema a b`,
  when it runs,
  then it prints "Give at most one folder." and "Usage: halonic schema [outDir]", and exits with 2.
- Given `halonic schema --colour`,
  when it runs,
  then it names the unknown option and exits with 2.
- Given a command that fails with "disk full",
  when it runs,
  then it prints "Error: disk full" and exits with 1.
