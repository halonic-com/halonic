# yaml.read-limits

- Status: active
- Since: 0.1.0
- Source: HAL-111

If lists and maps nest deeper than the depth limit (100 levels by default), then `readYaml` shall fail with a `too-deep` problem at the first list or map past the limit. If the text is longer than the length limit (1,000,000 characters by default), then `readYaml` shall fail with a `too-large` problem at line 1, column 1, before parsing. The depth is checked on the text itself, before the `yaml` library builds its tree, so a file under the length limit cannot use up memory.

## Examples

- Given 100 nested lists, when `readYaml` runs with the default limits, then it succeeds.
- Given 101 nested lists `[[[...]]]`, when `readYaml` runs, then the problem is `too-deep` at line 1, column 101, and says "Lists and maps nest more than 100 levels deep."
- Given 5,000,000 nested lists under a raised length limit, when `readYaml` runs, then the problem is `too-deep`, without building the tree.
- Given 200,000 nested lists, where the `yaml` library runs out of call stack, when `readYaml` runs, then the problem is the same `too-deep` one, not a crash.
- Given a depth limit of 2 and three nested maps, when `readYaml` runs, then the problem is `too-deep` at line 3.
- Given a length limit of 10 and an 11-character text, when `readYaml` runs, then the problem says "The file is 11 characters long; the limit is 10."
