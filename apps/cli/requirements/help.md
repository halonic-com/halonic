# cli.help

- Status: active
- Since: 0.1.0
- Source: HAL-187; plan 6.1 (help text generated from each command); the options line from HAL-2223, wrapped at 80 columns from HAL-6000, the usage line, summaries and option descriptions wrapped from HAL-6938; the first line and the unknown command from HAL-2196, in the words of the approved CLI output on HAL-1981 (sections 1.3 and 1.9)

The `halonic` command shall make its help from the commands themselves: `halonic --help` starts with a line saying what Halonic's command line is for, lists every command with its one-line summary, then, after "Options for every command:", each option that every command takes, on as many lines as keep each within 80 columns, every line but the last ending with a comma, and exits with 0, `halonic <command> --help` prints that command's usage line, summary and options and exits with 0, and `halonic` with no command prints the list and exits with 2. An unknown command shall print "There's no command" with the name and, as its fix, "Run halonic --help to see every command.", without the list, and exit with 2; when exactly one command is within an edit distance of 2 of the name, the first line adds "Did you mean" with that command. The options line shall name only options the CLI reads, and every help line shall fit 80 columns: a longer usage line shall break between arguments, never inside `[…]` or `<…>`, and go on under its first argument, and a longer command summary or option description shall break between words and go on under its own column, with the same words. Help shall wrap at 80 columns whatever the terminal's width, not counting colour codes, and an argument or word longer than the room it has shall go on its own line, never cut (cli-output 1.9, "How a long help line wraps").

## Examples

- Given `halonic --help`,
  when it runs,
  then it lists `schema` with its summary and exits with 0.
- Given `halonic --help`,
  when it runs,
  then after the commands it prints "Options for every command: --json, --no-color, --verbose, --debug, --help," and "--version".
- Given `halonic deploy` where there is no deploy command,
  when it runs,
  then it prints '✕ There\'s no command "deploy".' and, indented by two spaces, "Run halonic --help to see every command.", and exits with 2.
- Given `halonic tset` where there is a `test` command and no other command is close,
  when it runs,
  then its first line is '✕ There\'s no command "tset". Did you mean test?'.
- Given a command whose usage line and an option description are each longer than 80 columns,
  when its `--help` runs,
  then the usage line breaks between two arguments and goes on under the first argument, and the description breaks between two words and goes on under the description column.
