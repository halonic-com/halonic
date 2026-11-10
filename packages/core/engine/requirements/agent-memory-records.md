# engine.agent-memory-records

- Status: active
- Since: 0.1.0
- Source: HAL-1534, plan HAL-186 ("Agent memory as runtime data")

The engine shall keep an agent's memory as notes in the `RecordStore` collection `agent-memory/<agentId>`, never in workspace files. A note has a title and a text and is found by its title, ignoring case and the spaces around it: saving a title again replaces that note, and forgetting a title removes it. Each change shall carry the clock's time and name the agent, and the run when there is one. A title that is empty or longer than 120 characters, or a text longer than 16,000 characters, shall be refused with a `RangeError`, and nothing written. Listing the notes shall give them by title and leave out a record that isn't a note.

## Examples

- Given agent `clerk` with no notes,
  when it saves "Refunds" with "Ask for the order number",
  then the collection `agent-memory/clerk` gets an `add` of that note by agent `clerk`, and the notes list it.
- Given agent `clerk` with a note "Refunds",
  when it saves " refunds " with "Check the date first",
  then the change is an `update` of the same note, and the notes list one note "refunds" with the new text.
- Given agents `clerk` and `scout`,
  when `clerk` saves a note,
  then `scout` has no notes.
- Given a title of 121 characters,
  when the agent saves it,
  then it gets a `RangeError` and nothing is written.
