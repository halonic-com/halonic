# cli.help

- Status: active
- Since: 0.1.0
- Source: HAL-187; plan 6.1 (help text generated from each command); the options line from HAL-2223, in the words of the CLI output draft on HAL-1981 (section 1.9)

The `halonic` command shall make its help from the commands themselves: `halonic --help` lists every command with its one-line summary, then, after "Options for every command:", each option that every command takes, and exits with 0, `halonic <command> --help` prints that command's usage line, summary and options and exits with 0, and `halonic` with no command or with an unknown command prints the list and exits with 2. The options line shall name only options the CLI reads.

## Examples

- Given `halonic --help`,
  when it runs,
  then it lists `schema` with its summary and exits with 0.
- Given `halonic --help`,
  when it runs,
  then after the commands it prints "Options for every command: --debug, --help".
- Given `halonic deploy` where there is no deploy command,
  when it runs,
  then it prints 'Unknown command "deploy".' and the list, and exits with 2.
