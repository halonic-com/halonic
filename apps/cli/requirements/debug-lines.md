# cli.debug-lines

- Status: active
- Since: 0.1.0
- Source: HAL-4056 (plan approved on HAL-4064), from the review of halonic#1243: a scheduler's retries visible with `--debug`

When a command passes a debug line while it runs, such as a retry that may still work out, the `halonic` command shall write it to stderr straight away, only when the command line has `--debug`, with every secret value the command loaded through the CLI's `Secrets` replaced by "[secret removed]". A live line on the screen shall be erased first and drawn again below it. Without `--debug` the line shall go nowhere. A debug line shall never be part of the command's result: stdout shall be the same with and without it, and with `--json` stdout shall stay one JSON document while the debug line goes to stderr, as an error's `--debug` text does.

## Examples

- Given a command that passes "timer of step Draft a reply failed, try 2 of 3: refused" and a loaded key, and `--debug`,
  when it runs,
  then stderr gets that line with the key as "[secret removed]", and stdout only the command's result.
- Given the same command without `--debug`,
  when it runs,
  then stderr stays empty.
- Given the same command with `--json --debug`,
  when it runs,
  then stdout is one JSON document and the debug line is on stderr.
- Given a terminal showing the live line "◌ Draft reply" and `--debug`,
  when the command passes a debug line,
  then the live line is erased, the debug line written, and "◌ Draft reply" drawn again below it.
