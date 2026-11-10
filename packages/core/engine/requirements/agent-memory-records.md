# engine.agent-memory-records

- Status: active
- Since: 0.1.0
- Source: HAL-1534, HAL-3079, HAL-3299 (decision C258 on HAL-3295), plan HAL-186 ("Agent memory as runtime data")

The engine shall keep an agent's memory as notes in the `RecordStore` collection `agent-memory/<agentId>`, never in workspace files. A note has a title and a text and is found by its title, ignoring case and the spaces around it: saving a title again replaces that note, and forgetting a title removes it. Each change shall carry the clock's time and name the agent, and the run when there is one. A title that is empty or longer than 120 characters, or a text longer than 16,000 characters, shall be refused with a `RangeError`, and nothing written. An agent shall keep at most 100 notes, and its note texts together at most 64,000 characters: saving a new title past 100 notes, or a text that would take the total past 64,000, shall be refused with a `RangeError` whose message tells the model to forget, shorten or replace a note, and nothing written. Replacing a note under its title stays allowed at 100 notes. Forgetting a note shall give its title as saved. After forgetting a note, or saving a title that replaces one, the engine shall compact the collection, so the store keeps no earlier text of that note ([ADR 2026-11-08](../../../../docs/adr/2026-11-08-record-store-compaction.md)); saving a new title doesn't compact. Listing the notes shall give them ordered by title by Unicode code point, the same on every host, and leave out a record that isn't a note.

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
- Given agent `clerk` with 100 notes,
  when it saves a new title,
  then it gets a `RangeError` saying to forget or replace a note, and nothing is written;
  and when it saves one of the 100 titles again, the note is replaced.
- Given agent `clerk` with notes whose texts hold 60,000 characters,
  when it saves a new note of 5,000 characters,
  then it gets a `RangeError` saying to shorten or forget notes, and nothing is written.
- Given agent `clerk` with notes "Refunds" and "Shipping",
  when it forgets "Refunds",
  then `changes()` of `agent-memory/clerk` holds no trace of the note's title or text, only a `seed` of "Shipping".
- Given agent `clerk` with a note "Refunds",
  when it saves "refunds" with a new text,
  then `changes()` of `agent-memory/clerk` holds only the new text.
