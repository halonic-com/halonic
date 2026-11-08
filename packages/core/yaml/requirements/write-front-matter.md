# yaml.write-front-matter

- Status: active
- Since: 0.1.0
- Source: HAL-111

When `writeFrontMatter` writes the fields of a front matter block, the writer shall produce exactly the text the old app wrote for `SKILL.md`: the `yaml` library's `stringify` with its default options, trimmed, without the `---` lines.

## Examples

- Given `name` and `description`, when `writeFrontMatter` runs, then it writes two lines and no trailing newline.
- Given a long description, when `writeFrontMatter` runs, then it folds at 80 columns.
- Given the name `"null"`, when `writeFrontMatter` runs, then it is double-quoted.
