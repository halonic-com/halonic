# paperclip.board-check-ask-route

- Status: active
- Since: unreleased
- Source: HAL-18857 (the board's proposal to retire the Board Checker agent, 25 Nov)

Where the board's settings name a board ask wake task, when the Agent tools plugin's board check finds at least one new board ask, it shall wake that task once for the batch, with reason `board_check_ask`, instead of the Board Checker's task, keep the `board-asks` document on the Board Checker's task, and not treat as an ask a comment written by the agent holding the wake task; where the settings name none, it shall keep waking the Board Checker's task as `paperclip.board-check-asks` says.

## Examples

- Given the wake task is Chief's chat task and Mateo writes "This needs the board's yes on the card" on HAL-16003,
  when the board check sees the comment,
  then it updates `board-asks` on the Board Checker's task and wakes Chief's chat task once, and doesn't wake the Board Checker.
- Given the same setting and Chief writes "The board card is up" on HAL-16004,
  when the board check sees the comment,
  then it writes nothing.
- Given no wake task in the settings,
  when Mateo's ask comes in,
  then the board check wakes the Board Checker's task, as before.
