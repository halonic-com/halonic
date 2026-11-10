# metrics.findings-per-pull-request

- Status: active
- Since: 0.1.0
- Source: HAL-3102; the metric "Review findings per PR" in the metrics document on HAL-3035 (draft 2)

When the findings counter is given a repository and a time window, the findings counter shall report, for each pull request merged inside the window, the tagged findings of its reviews, inline review comments and conversation comments by severity, using only GET requests to the GitHub API's own origin.

## Examples

- Given pull request 12 merged inside the window with a review "- [major] No test" and a conversation comment "[nit] Typo",
  when the counter runs,
  then the row for #12 has 1 major and 1 nit, and the total row counts 1 PR.
- Given a pull request merged before the window and one closed without merging,
  when the counter runs,
  then neither has a row.
- Given a list page whose next link points to another host,
  when the counter follows it,
  then it stops with an error and sends no request to that host.
