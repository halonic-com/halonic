# format.skill-file

- Status: active
- Since: 0.1.0
- Source: HAL-113 (plan 7.3), ported from 784f78d `parseSkillMarkdown` and `collectSkills` in `packages/core/config/src/workspace.ts`

When `parseFile` reads a `SKILL.md`, the format shall take the YAML front matter between the first two `---` lines, require a non-empty `name` and `description`, drop other front matter keys, use the folder as the id, and trim the Markdown after it as the body. Unlike the old loader, a problem has its path and its line in the file, and broken front matter YAML is reported as a YAML problem instead of as a missing name and description.

## Examples

- Given front matter with `name` and `description` and folder `plain-words`, when it is parsed, then the value is `{ id: plain-words, name, description, body }` with the body trimmed.
- Given front matter without `description`, when it is parsed, then it fails with `invalid_type` at `description`, line 2.
- Given no front matter, when it is parsed, then it fails at `name` and `description`, line 1.
- Given `name: [Plain words` in the front matter, when it is parsed, then it fails with one `syntax` problem on line 3, where the YAML library notices it.
