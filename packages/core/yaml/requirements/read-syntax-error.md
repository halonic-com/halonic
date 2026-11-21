# yaml.read-syntax-error

- Status: active
- Since: 0.1.0
- Source: HAL-111; plain hints from Kim's first-run check C336 (HAL-14261)

If the text is not valid YAML, then `readYaml` shall fail with a `syntax` problem that carries the first line of the `yaml` library's first error message and the 1-based line and column where that error starts, as the old app reported it. For a colon and a space inside the value the error points at, a tab used to indent and a quote that never closes, the message shall start with a plain hint and give the parser's line after it, in parentheses; an unclosed quote shall be reported where it opens, not at the end of the file (parity difference `unclosed-quote-at-its-opening-line`).

## Examples

- Given `a: [1, 2` with no closing bracket, when `readYaml` runs, then the problem is `syntax` at line 2, column 1.
- Given the key `name` twice, when `readYaml` runs, then the problem is "Map keys must be unique" at the second `name`.
- Given a text with two syntax errors, when `readYaml` runs, then only the first is reported.
- Given `name: Writer: the one who writes` on line 2, when `readYaml` runs, then the message starts `A value has ": " in it. Put the value in quotes.`, at line 2, column 7.
- Given `name: Writer` with `  model: smart` indented under it, when `readYaml` runs, then the message is the parser's alone, without the quotes hint.
- Given `name: 'Writer` on line 2 and no closing quote, when `readYaml` runs, then the problem is at line 2, column 7.
