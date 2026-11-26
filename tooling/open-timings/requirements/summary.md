# open-timings.summary

- Status: active
- Since: unreleased
- Source: HAL-19600, from the HAL-19531 plan

When it is given the text of Studio's `shell.log`, the summary shall read the lines from the source `timings` (`studio.src-tauri.open-timings`) and write a Markdown table with one row per step and its milliseconds: `start` for the agent host's whole start, `start: <step>` for each of its steps when there is more than one, `ready` for when the start was ready after the page loaded, `engine` for how long the first window's engine took to answer, and `open` for the page's load to that answer. A later start or a later window's engine shall not replace the first. The summary shall flag the open, and fail, when it took longer than the budget, 10 s unless it is given another, when the engine was refused, or when no engine answered at all. A line from another source shall not count, and the summary shall never copy a line's text beyond the step names and milliseconds.

## Examples

- Given a log whose `timings` lines say the host started beside the shell in 4000 ms, the start was ready 9001 ms after the page loaded, and a window's engine answered in 3250 ms, asked 1200 ms after the page loaded,
  when the summary reads it,
  then the table has the rows `start` 4000, `ready` 9001, `engine` 3250 and `open` 4450, and nothing is flagged.
- Given an engine that answered in 9500 ms, asked 1000 ms after the page loaded,
  when the summary reads it,
  then the open of 10500 ms is flagged as over the 10 s budget.
- Given an engine refused as `engine_failed`,
  when the summary reads it,
  then the open is flagged as refused.
- Given a log with no engine line,
  when the summary reads it,
  then it says no window's engine answered, and the open is flagged.
