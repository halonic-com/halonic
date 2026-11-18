# runs.run-view.receipt-items

- Status: active
- Since: unreleased
- Source: HAL-62 receipt requirements RCPT-2.1, RCPT-3.3 and RCPT-5.1 ("artifacts created"); the heading and line wording are a team decision under HAL-2282 (HAL-12404)

The run page's receipt shall have an Items section, first among its sections, with one line for the files the run saved, each name once in the order saved: "Created 1 file: weekly-report.md", or "Created 3 files: a.md, b.md and c.md". A run that saved no file shall have no section. The names shall be plain text, with every hidden or direction-changing character written as its `\uXXXX` escape.

## Examples

- Given a Weekly report run that saved weekly-report.md,
  then Items lists "Created 1 file: weekly-report.md".
- Given a run that saved notes.md, then summary.md, then notes.md again,
  then Items lists "Created 2 files: notes.md and summary.md".
- Given a run that saved no file,
  then the receipt has no Items section.
