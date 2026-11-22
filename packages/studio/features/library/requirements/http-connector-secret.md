# library.http-connector-secret

- Status: active
- Since: unreleased
- Source: HAL-15375 (flow check C565, row 7; a team wording call on the approved connector page, HAL-2282)

Where a connector over HTTP names a secret, the Library feature shall show, under its page's "How it connects" section, one line saying where that secret is set, followed by the command `halonic secret set <name>` in a command box. In the desktop app, whose window connects to no server over HTTP yet, the line shall be "Studio can't connect to a server over HTTP yet, so it doesn't use <name>. Runs from a terminal do. To set it for them, run this in a terminal:". Elsewhere (a browser behind `halonic serve`, a phone), the line shall be "Studio can't set <name>. Halonic reads it from the secrets of the computer it runs on. To set it, run this in a terminal on that computer:". The page shall show no entry for the secret's value, and shall show no such line for a connector over HTTP without a secret or for any other kind of connector.

## Examples

- Given the connector Tracker over HTTP with the secret `tracker-token`,
  when its page opens in the desktop app,
  then under "How it connects" it says "Studio can't connect to a server over HTTP yet, so it doesn't use tracker-token. Runs from a terminal do. To set it for them, run this in a terminal:" and shows `halonic secret set tracker-token`.
- Given the same connector in a browser behind `halonic serve`,
  when its page opens,
  then it says "Studio can't set tracker-token. Halonic reads it from the secrets of the computer it runs on. To set it, run this in a terminal on that computer:" and shows the same command.
- Given a connector over HTTP without a secret, or a local program connector,
  when its page opens,
  then it shows no such line.
