# messenger.load-states

- Status: active
- Since: unreleased
- Source: design review HAL-18481 (improvement 3 and motion 7), approved by the board on HAL-10 (25 Nov, 13:28 UTC); HAL-18556.

While the Messenger's first read of its conversations is on its way, it shall show its New button and tabs over loading rows in the shape of its rows, so nothing moves when the chats arrive, and never "No chats yet". When that first read fails, it shall say "Couldn't load your chats" with the reason and a **Try again** button that reads again. When a later read fails, it shall keep the conversations it showed, under the line the Inbox shows then, "The engine isn't answering. Showing what it said last.".

## Examples

- Given the engine hasn't answered the first read yet,
  when 300 ms have passed,
  then the list shows its tabs over its loading rows and "Loading your chats" is read out, and no "No chats yet" shows.
- Given the first read fails,
  when the Messenger opens,
  then it says "Couldn't load your chats" and "The engine isn't answering. It may still be starting." with **Try again**.
- Given the Messenger showed Chief's chat,
  when a later read fails,
  then Chief's row stays, under "The engine isn't answering. Showing what it said last.".
