# yaml.read-syntax-error

- Status: active
- Since: 0.1.0
- Source: HAL-111

If the text is not valid YAML, then `readYaml` shall fail with a `syntax` problem that carries the first line of the `yaml` library's first error message and the 1-based line and column where that error starts, as the old app reported it.

## Examples

- Given `a: [1, 2` with no closing bracket, when `readYaml` runs, then the problem is `syntax` at line 2, column 1.
- Given the key `name` twice, when `readYaml` runs, then the problem is "Map keys must be unique" at the second `name`.
- Given a text with two syntax errors, when `readYaml` runs, then only the first is reported.
