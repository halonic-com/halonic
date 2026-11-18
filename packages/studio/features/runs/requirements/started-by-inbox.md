# runs.started-by-inbox

- Status: active
- Since: unreleased
- Source: HAL-12727 (L5, D3), from the first-run check HAL-12714 (F11)

A run started from the Inbox's request form shall say so wherever the Studio says what started a run: the Runs list's Started by column and the run page's Started by row shall read "You, in the Inbox", and the row's sentence and the Inbox card shall say "Started by you, in the Inbox". A run whose log names a trigger this Studio doesn't know, written by a newer Halonic, shall still show, with the words of a run started with Run.

## Examples

- Given a run started from the Inbox's request form at 10:40,
  when its row is shown,
  then its Started by column reads "You, in the Inbox",
  and a screen reader hears "Started by you, in the Inbox, 10:40." at the end of its sentence.
- Given that run,
  when its run page or its Inbox card is shown,
  then Started by reads "You, in the Inbox" on the page and "Started by you, in the Inbox" on the card.
- Given a run whose log names the trigger "voice", which this Studio doesn't know,
  when its row is shown,
  then it shows, and its Started by column reads "You, with Run".
