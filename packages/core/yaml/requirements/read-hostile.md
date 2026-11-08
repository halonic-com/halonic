# yaml.read-hostile

- Status: active
- Since: 0.1.0
- Source: HAL-111

The reader shall never throw on any text: for every input, `readYaml` shall return either data or a problem whose line and column are 1 or more and whose message is a single line.

## Examples

- Given random text with odd Unicode, control characters, byte order marks and line separators, when `readYaml` runs, then it returns a result.
- Given random nesting of `[`, `{ k: `, `- ` and `k:`, when `readYaml` runs, then it returns data or a `syntax` or `too-deep` problem.
