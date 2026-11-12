# library.status-section

- Status: active
- Since: 0.1.0
- Source: HAL-1063; Sofia's layout review (HAL-7814); Liam's plan approval (HAL-7815)

The Library feature shall give a status section for one connector, which the connector page puts under its `h1`. The section shall show the connector's state as a word, with the sentence that says why, then a "Recent refusals" heading and the refusals as a plain list of text lines, newest first, never more than 20, with a note when the list is full. While the host has not answered, the section shall show loading; when the first answer fails, it shall show that refusals couldn't load with Try again; and it shall say that nothing was refused only after the host answered with none. When a later answer fails, the section shall say the engine isn't answering and keep what it showed. A state change while the page is open shall be announced once; the first state shown shall not be. The section shall draw no landmark, no live region on the list, and no line cut short.

## Examples

- Given a connector that needs sign-in with two refusals,
  when the section shows,
  then it shows the word "Needs sign-in", its sentence, and two lines under "Recent refusals".
- Given a host that has not answered,
  when the section shows,
  then it shows loading and not "Nothing refused since Halonic started."
- Given a host whose first answer fails,
  when the section shows,
  then it shows "Couldn't load refusals" and Try again, which asks the host again.
- Given a shown connector whose state changes from Connected to Needs sign-in,
  when the host says so,
  then the change is announced once.
