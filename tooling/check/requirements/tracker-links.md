# check.tracker-links

- Status: active
- Since: 0.1.0
- Source: HAL-7143, agreed by Liam on HAL-7136

If a Markdown file has a link whose target starts with `/HAL/issues/`, as an inline link or a reference definition, then the `tracker-links` check shall fail, name the file and line, and say to write the task id as plain text and link the requirement or ADR instead.

## Examples

- Given `See [HAL-136](/HAL/issues/HAL-136).` in a README, then the check fails on that line.
- Given `[plan](/HAL/issues/HAL-1#document-plan)` in a requirement's `Source:` line, then the check fails on that line.
- Given the reference definition `[plan]: /HAL/issues/HAL-1` in an ADR, then the check fails on that line.
- Given the plain task id `HAL-136`, then the check passes.
- Given such a link inside a code block or a code span, then the check passes.
- Given a link target starting with `/HAL/issues/` in a file that isn't Markdown, then the check passes.
