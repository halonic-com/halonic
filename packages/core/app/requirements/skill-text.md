# app.skill-text

- Status: active
- Since: unreleased
- Source: HAL-1303, P5; flow-library 5.1, `library.skills.save-on-leave`, `library.skills.empty-name-kept`, `library.skills.keep-extra-header-fields` (HAL-119)

When the skill page shows or changes a skill, `readSkillText` shall return the skill's name, its description ("when to use it"), its instructions (the Markdown after the header, trimmed) and the other header fields as `key: value` lines in the file's order, and `editSkillText` shall return the file's text with only the asked-for parts changed. Every other header field shall keep its value, its order and its comments. A part that is not in the change, or that is given unchanged, shall leave the text exactly as it was, so a field that was left without editing writes nothing. If the change empties the name or the description, then it shall return `name_missing` or `description_missing` and no text, so the caller keeps the old one. If the file has no header, or its header is not valid YAML, then it shall return `unreadable`.

## Examples

- Given a skill with `license: MIT` and `allowed-tools: Read` in its header,
  when its description changes,
  then both fields keep their values and order in the new text.
- Given a skill, when the same name and instructions are given again, then the text is the one it was.
- Given a skill, when the name is changed to spaces, then the error is `name_missing`.
- Given a header comment `# shown in the list`, when the name changes, then the comment stays.
- Given a file without `---` lines, then the error is `unreadable`.
