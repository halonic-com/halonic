# cli.output-style

- Status: active
- Since: 0.1.0
- Source: HAL-2184; the CLI output design on HAL-1981 (cli-output sections 1.4 and 1.5), approved by the board on HAL-2123

The `halonic` command shall decide once per command line, for each output stream, whether it gets colour, live lines and the Unicode marks. Colour shall be off when the stream isn't a terminal, `NO_COLOR` is set, `TERM` is `dumb`, or `--no-color` or `--json` is given; `FORCE_COLOR` shall turn it on, unless one of those flags is given. Live lines shall be off when the stream isn't a terminal, `TERM` is `dumb`, `--no-color` or `--json` is given, or `CI` is set and isn't `0` or `false`. When the stream isn't UTF-8, the marks shall be `ok`, `x` and `!` instead of ✓, ✕ and !. With colour off, the output shall hold no escape codes.

## Examples

- Given a terminal and no colour variables,
  when the style is decided,
  then colour and live lines are on and the marks are Unicode.
- Given a pipe,
  when the style is decided,
  then colour and live lines are off, and a ✓ mark is written as "✓" with no escape code.
- Given a terminal and `NO_COLOR=1`,
  when the style is decided,
  then colour is off and live lines stay on.
- Given a terminal and `CI=true`,
  when the style is decided,
  then colour stays on and live lines are off.
- Given a pipe and `FORCE_COLOR=1`,
  when the style is decided,
  then colour is on; with `--no-color` as well, it is off.
- Given the old Windows console, or the locale `en_US.ISO-8859-1`,
  when the marks are written,
  then ✓ is "ok", ✕ is "x" and ! is "!".
