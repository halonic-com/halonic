# metrics.tagged-findings

- Status: active
- Since: 0.1.0
- Source: HAL-3102; the four severity tags decided in the metrics document on HAL-3035 (draft 2), from HAL-3050; `docs/guides/review.md`

When the findings counter reads a review comment, the findings counter shall count one finding for each line that starts with `[blocker]`, `[major]`, `[minor]` or `[nit]`, after an optional list marker, and shall leave out quoted lines and lines inside code blocks.

## Examples

- Given a review text with the lines "- [blocker] Token in the log", "1. [major] No test" and "[nit] Typo",
  when the counter reads it,
  then it counts 1 blocker, 1 major, 0 minor and 1 nit.
- Given a reply that quotes "> [major] No test" and a code block that contains "[minor] x",
  when the counter reads it,
  then it counts no findings.
- Given a line "See [major] above" where the tag is not at the start,
  when the counter reads it,
  then it counts no finding.
