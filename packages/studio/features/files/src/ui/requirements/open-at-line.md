# files.open-at-line

- Status: active
- Since: unreleased
- Source: HAL-14902 (part 1 of HAL-14370); C348 on HAL-14317, ST4 and A3

When another feature asks to open a file at a line, such as a broken file's row at its first problem, the file's tab shall put the cursor on that line and focus its editor, once its editor is ready, or at once when the tab is already open. Each request shall be taken once: opening the file again later leaves the cursor and the focus alone.

## Examples

- Given a request to open `hubs/support/agents/writer.agent.yaml` at line 2,
  when its tab opens,
  then the editor's cursor is on line 2 and the editor has the focus.
- Given the tab of `writer.agent.yaml` is already open,
  when a request asks for line 4,
  then the cursor moves to line 4.
- Given the request was taken,
  when the file opens again later,
  then the cursor isn't moved.
