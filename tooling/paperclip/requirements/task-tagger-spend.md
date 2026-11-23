# paperclip.task-tagger-spend

- Status: active
- Since: unreleased
- Source: HAL-16928; the board's comments on HAL-16876 (23 Nov), point 4

The Agent tools plugin shall add the cost of each of the difficulty tagger's Haiku calls, from the input and output tokens the API reports at Claude Haiku 5.5's prices ($0.10 and $0.50 per million tokens), to the company's spend for the calendar month (UTC); while that spend is $5 or more, it shall make no Haiku call for the company, log the stop as a warning and save `task_tagger.limit_reached` once that month, and start again in the next month; and the plugin's health on the plugin page shall show each company's spend for the month and whether the tagger stopped, with the status `degraded` while any company's tagger stopped.

## Examples

- Given a call that reports 2,000 input and 100 output tokens,
  when the plugin adds it up,
  then the month's spend grows by $0.00025.
- Given a company whose November spend is $5.00,
  when two tasks are created in November,
  then the plugin calls Haiku for neither, logs "stopped for the month, $5.00 of $5 in 2026-11" once and saves `task_tagger.limit_reached` once.
- Given the same company on 1 December,
  when a task is created,
  then the plugin calls Haiku again, counting from $0.
- Given one company at $5.00 this month,
  when the host asks the plugin for its health,
  then the answer is `degraded` and its message names the company, "stopped for the month" and its spend.
