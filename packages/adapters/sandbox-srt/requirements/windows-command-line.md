# sandbox-srt.windows-command-line

- Status: active
- Since: 0.1.0
- Source: HAL-9774, HAL-196

The sandbox-srt adapter shall build the command line it runs through `cmd.exe` on Windows so that it never starts with a double quote, whatever variables the program has, because `cmd.exe /c` removes the first and last quote of a line that starts with one.

## Examples

- Given a program with no variables to set and no variables to remove,
  when the Windows command line is built,
  then it does not start with a double quote and still ends with the quoted program and its arguments.
- Given a program with variables to set or remove,
  when the Windows command line is built,
  then it does not start with a double quote.
