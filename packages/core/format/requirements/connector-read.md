# format.connector-read

- Status: active
- Since: 0.1.0
- Source: HAL-5583 (board decision on HAL-5522, option A; wording by Sofia on HAL-5582 and HAL-5762); name rule from the review on HAL-5673

When `parseFile` reads a connector file, the format shall accept `tools.read` as a list of exact tool names, refuse a name that looks like a pattern with `read-tool-pattern`, refuse a name that breaks the listed-tool name rule of `ports.untrusted-tool-listings` (1 to 64 ASCII letters, digits, `_` or `-`) with `read-tool-name`, and warn with `read-tool-not-allowed`, without failing the file, for a name that `tools.allow` leaves out; and `marksRead` shall say that a tool only reads when `tools.read` names it exactly and `tools.approve` doesn't make it ask first.

Rationale: a connector's server writes its own tool listing, so the engine counts every tool as `write` or `send` (HAL-5199). Only the person who writes the connector file can mark a tool as only reading, by its exact name, so a pattern can't let in a tool the server adds later.

## Examples

- Given `read: [search_issues]`, when the file is parsed, then `tools.read` is `["search_issues"]` with no warnings.
- Given `read: search_issues`, when the file is parsed, then it fails at `tools.read` with `"read" must be a list of tool names.`
- Given `read: ["search_*"]`, when the file is parsed, then it fails with `read-tool-pattern` at `tools.read[0]`: `"read" needs exact tool names. "search_*" looks like a pattern.`
- Given `read: ["search_іssues"]` with a Cyrillic `і`, or `"search_issues "` with a trailing space, or `search_issues` followed by a zero-width space, or `""`, when the file is parsed, then it fails with `read-tool-name` at `tools.read[0]`, with a message that doesn't quote the name.
- Given `allow: [search_issues]` and `read: [search_isues]`, when the file is parsed, then it passes with one warning `read-tool-not-allowed` at `tools.read[0]`: `"read" lists "search_isues", but this connector has no tool by that name. Check the spelling.`
- Given `read: [search_issues]`, when `marksRead` is asked about `search_issues`, then it answers yes; about `Search_issues` or `create_issue`, no.
- Given `read: [search_issues]` and `approve: [search_issues]`, or `approve: all`, when `marksRead` is asked about `search_issues`, then it answers no.
- Given no `read`, when `marksRead` is asked about any tool, then it answers no.
