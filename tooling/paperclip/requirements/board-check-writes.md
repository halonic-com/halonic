# paperclip.board-check-writes

- Status: active
- Since: unreleased
- Source: HAL-16194; the Board Checker addendum on HAL-15997, section 1, with Liam's conditions on HAL-16192 (22 Nov)

When the Agent tools plugin's board check sends the writes it planned for a pass, the plugin shall send only comments on a task named in its settings, updates of the `board-waiting` and `board-asks` documents on the Board Checker's task, and wake-ups through Paperclip's wake call with a `board_check_` reason; it shall send no write of a pass that plans any other write or more than 5 wake-ups, 5 comments or 2 document updates, and save the `board_check.gate_refused` metric for the HAL-16006 alert instead; it shall send each write only if, read right before that write, the board's switch allows the running version to write, and otherwise log the write's kind, target and size; and it shall put no text from a comment or an error into a write, a log line, a metric or its saved state.

## Examples

- Given a pass that plans a comment on the Board Checker's task, the `board-asks` document and a wake-up,
  when its writes go out,
  then the plugin calls create-comment, the document upsert and the wake call once each, and the comment ends with "Board check (plugin)".
- Given a pass that plans a status change, a reassignment, a blocker, a label, an approval decision, another document, a comment on a task the settings don't name, or a wake-up without its reason,
  when its writes go out,
  then the plugin writes nothing in that pass and saves `board_check.gate_refused`.
- Given a pass that plans 6 wake-ups,
  when its writes go out,
  then the plugin writes nothing and saves `board_check.gate_refused`; a pass with 5 wake-ups, 5 comments and 2 document updates goes out whole.
- Given the plugin was just installed or upgraded to 0.2.0 and the board's switch says 0.1.0 or nothing,
  when a pass finds a board ask,
  then the plugin writes nothing and logs "would update document board-asks" and "would wake task".
- Given the board turns the switch off after the first write of a pass,
  when the rest of the pass goes out,
  then the plugin only logs the remaining writes.
- Given agents' comments holding made-up keys and passwords, and a host error whose message holds one,
  when the board check runs with its switch on and off,
  then none of them appears in a write, a log line, a metric or the saved state.
- Given a plugin context whose calls to change a task, its blockers, an approval or an agent fail the test when touched,
  when the board check handles an event and runs its job,
  then it touches none of them.
