# contracts.fake-paperclip-source

- Status: active
- Since: unreleased
- Source: HAL-17422 breakdown (rev 2): Studio's Inbox and Messenger tracks build against a fake until the Paperclip client lands; task HAL-17425

The `FakePaperclipSource` shall be a `PaperclipSource` that runs in the process, so Studio's Inbox and Messenger can be built and tested before the Paperclip client exists. A test shall be able to add agents, projects, tasks, comments and cards, answer a card as another client would, and cut and restore the line. It shall answer an open card once and report a card already answered with who answered it and when, comment only on a task whose `chatWith` is set, and refuse an item of another connection or company with `not-found`. Offline, it shall give the items as they were when the line was cut, with `offline` set and the time of the last live read, and refuse every write with `offline` without sending it later.

## Examples

- Given a card the fake already answered,
  when it is answered again,
  then the result is `already-answered` with the board as the one who answered.
- Given a card another client answered with `answerElsewhere`,
  when the board answers it,
  then the result is `already-answered` with that client.
- Given a card whose ID names the connection `globex`,
  when the fake for `acme` is asked to answer it,
  then the result is `refused` with `not-found`.
- Given a task without `chatWith`,
  when a comment is posted on it,
  then the result is `refused` with `not-a-chat`.
- Given a fake whose cards were last read at 10:00 and whose line was cut at 10:05,
  when its cards are listed and a card is answered,
  then the list says offline as of 10:00, and the answer is `refused` with `offline` and is still not sent once the line is back.
