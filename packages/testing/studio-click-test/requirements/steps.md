# studio-click-test.steps

- Status: active
- Since: unreleased
- Source: HAL-18317 (plan approved by Liam, 25 Nov; step 1 asked by Tomas for Chief), HAL-18353

The click test shall drive the installed Studio only through its windows, with clicks and the text on screen, reading the expected text from the features' words files, and shall check, in order:

1. **The engine answers:** from Welcome, Open demo turns on and opens the demo, and the Assistant chat shows its heading with no "The engine isn't answering" line, then or for 20 s after. When it fails, the step's note holds the `engine` and `agent host` lines of Studio's `shell.log`.
2. **Messenger's empty state:** the Start menu's Halonic Messenger shortcut opens a window that shows No connections. Anything else fails, with the code of the error Settings › Connections shows (such as `LIST_FAILED`), or `EMPTY_STATE_MISSING`.
3. **Connect Paperclip:** Settings › Connections › Connect Paperclip with the throwaway Paperclip's address, approved there as its board, ends with the row showing Connected.

## Examples

- Given a chat that shows "The engine isn't answering. Showing what it said last.",
  then step 1 fails as `ENGINE_NOT_ANSWERING`, with the shell log's engine lines in its note.
- Given a Messenger that stays blank while Settings › Connections shows "Halonic couldn't read the connections. Close Settings and open it again.",
  then step 2 fails as `LIST_FAILED`.
- Given a Paperclip that never got a sign-in from Studio,
  then step 3 fails as `NOT_APPROVED`.
- Given a button label copied from a React file that no longer holds it,
  then the package's own tests fail.
