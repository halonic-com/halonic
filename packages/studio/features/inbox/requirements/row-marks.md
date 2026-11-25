# inbox.row-marks

- Status: active
- Since: unreleased
- Source: HAL-18557; design review HAL-18481, improvement 5 (approved by the board on HAL-10)

The Inbox shall start each row in Needs you with a mark that says what kind of item it is: a stamp for an approval, a pause for a person step, a gear for a setup item, the agent's picture (their initials until the picture is read) for an agent's card, and a question mark for a question from someone who isn't an agent. The marks shall be decoration that a screen reader doesn't read, since the row's title and line already say what it is.

## Examples

- Given an approval, a person step and a card from Chief,
  when you open the Inbox,
  then the approval's row starts with a stamp, the person step's with a pause, and Chief's card's with "C" on a round tile.
