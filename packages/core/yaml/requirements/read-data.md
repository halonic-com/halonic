# yaml.read-data

- Status: active
- Since: 0.1.0
- Source: HAL-111

When `readYaml` reads valid YAML that uses only supported features, the reader shall return the same data as the old app: plain objects, arrays, strings, numbers, booleans and `null`, read with the YAML 1.2 core schema of the `yaml` library.

## Examples

- Given `name: Billing` and a block list of steps, when `readYaml` runs, then the data is `{ name: "Billing", steps: [...] }`.
- Given flow maps and lists such as `tags: [a, 'b c']`, when `readYaml` runs, then they read like their block forms.
- Given a double-quoted value with `\n`, `\"`, `\\` and a `\u` escape, when `readYaml` runs, then each escape becomes its character.
- Given `|`, `|-`, `>` and `>+` blocks, when `readYaml` runs, then line breaks are kept, stripped, folded or kept as YAML says.
- Given `a: yes`, when `readYaml` runs, then `a` is the text `"yes"`, not `true`.
- Given an empty file, or one with only comments, when `readYaml` runs, then the data is `null`.
- Given a byte order mark and Windows line endings before a top-level map, when `readYaml` runs, then the data is the same as without them.
- Given a byte order mark right before a top-level block list (`- a`), when `readYaml` runs, then it is a syntax error at line 1, as in the old app (a quirk of yaml 2.9.1).
- Given a `__proto__` key, when `readYaml` runs, then it is an ordinary key and no object prototype changes.
