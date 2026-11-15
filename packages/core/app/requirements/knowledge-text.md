# app.knowledge-text

- Status: active
- Since: 0.1.0
- Source: HAL-1303, P6; flow-library 5.2, `library.knowledge.summarize-on-request`, `library.knowledge.lookup-mode` (HAL-119)

When the knowledge page shows or changes a source, `readKnowledgeText` shall return the source's name, its summary, its lookup mode (`tools` when the file has no `mode`), whether it is writable and its provider, and `editKnowledgeText` shall return the file's text with only the asked-for parts changed. Picking `auto` shall write `mode: auto`, picking `tools` shall remove `mode`, a summary shall be written trimmed, and an empty summary or `null` shall remove `summary`. Every other field shall keep its value, its order and its comments. A part that is not in the change, or that is given unchanged, shall leave the text exactly as it was. If the file is not valid YAML or not a map, then both shall return `unreadable` and no text.

## Examples

- Given `mode: auto`, when `tools` is picked, then the line `mode: auto` is gone and nothing else changed.
- Given a source with no `mode`, when `auto` is picked, then the file gets `mode: auto`.
- Given a source with `summary: Old`, when the summary becomes "Refund timing, one page per topic.", then only that line changes.
- Given a source with a summary, when the summary is removed, then `summary` is gone from the file.
- Given a header comment, when the mode changes, then the comment stays.
- Given text that is not YAML, then the error is `unreadable`.
