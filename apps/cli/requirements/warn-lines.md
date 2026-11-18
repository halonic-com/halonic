# cli.warn-lines

- Status: active
- Since: unreleased
- Source: HAL-2212, approved on HAL-2212: tools that wait for approval are a warning, not only a `--debug` line

When a command passes a warning while it runs, such as tools that wait for a person's approval, the `halonic` command shall write it to stderr straight away, with or without `--debug`, with every secret value the command loaded through the CLI's `Secrets` replaced by "[secret removed]". A live line on the screen shall be erased first and drawn again below it. A warning shall never be part of the command's result: stdout shall be the same with and without it, and with `--json` stdout shall stay one JSON document while the warning goes to stderr.

## Examples

- Given a command that passes a warning that quotes a loaded key, and no `--debug`,
  when it runs,
  then stderr gets that line with the key as "[secret removed]", and stdout only the command's result.
- Given the same command with `--json`,
  when it runs,
  then stdout is one JSON document and the warning is on stderr.
