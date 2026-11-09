# cli.help

- Status: active
- Since: 0.1.0
- Source: HAL-187; plan 6.1 (help text generated from each command)

The `halonic` command shall make its help from the commands themselves: `halonic --help` lists every command with its one-line summary and exits with 0, `halonic <command> --help` prints that command's usage line, summary and options and exits with 0, and `halonic` with no command or with an unknown command prints the list and exits with 2.

## Examples

- Given `halonic --help`,
  when it runs,
  then it lists `schema` with its summary and exits with 0.
- Given `halonic deploy` where there is no deploy command,
  when it runs,
  then it prints 'Unknown command "deploy".' and the list, and exits with 2.
