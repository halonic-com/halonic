# agents.map.routine-cant-start

- Status: draft
- Since: unreleased
- Source: HAL-15646 (C605 #8); HAL-15607 (C600 #2: the Routines list's "Can't start")

Where the agent map shows a routine that starts the agent on its own, which Halonic can't run yet, the agents feature shall show on its card the chip "Can't start" that the Routines list shows for it (`routines.list.rows-and-states`), in the same words, and shall add those words to the card's name.

## Examples

- Given the routine "Morning replies" says `run: agent: writer`, then the map of Writer shows its card "Routine Morning replies" with the chip "Can't start", named "Routine Morning replies, Can't start".
- Given the routine "Weekly digest" at the workspace's root, whose card opens nothing, then its card shows "Can't start" too.
- Given the routine is pressed, then its page opens, where its Starts card says why and what to do instead.
