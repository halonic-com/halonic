# app.run-list-facts

- Status: active
- Since: 0.1.0
- Source: HAL-2742; cli-output revision 27, section 3.4 (HAL-1981)

The run history shall tell whether the workspace has test runs, so an empty run list can say it has only test runs, and whether a run made a tool call.

## Examples

- Given only a test run,
  when the runs are listed,
  then the list is empty, and the history says the workspace has test runs.
- Given a run whose log has a tool call and a run whose log has none,
  when each is asked about,
  then the first made tool calls and the second didn't.
