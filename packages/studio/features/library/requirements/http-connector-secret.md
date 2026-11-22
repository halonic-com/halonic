# library.http-connector-secret

- Status: active
- Since: unreleased
- Source: HAL-15375 (flow check C565, row 7) and HAL-15706 (flow check C618, row 2); HAL-15837 (C636 #5, no list of commands; words, Sofia on HAL-15847); team wording calls on the approved connector page, HAL-2282

Where a connector over HTTP names a secret, the Library feature shall show, under its page's "How it connects" section, one line saying where that secret is set and that Studio can't tell whether it is, followed by the command `halonic secret set <name>` in a command box, followed by a line naming the variable `HALONIC_SECRET_<NAME>` as the other way, in the form the command line's refusals give it. In the desktop app, whose window connects to no server over HTTP yet, the first line shall be "Studio can't connect to a server over HTTP yet, so only runs you start or continue with halonic in a terminal use <name>. Studio can't tell whether it's set. To save it, run this in a terminal:" and the last "Or set HALONIC_SECRET_<NAME> in the terminal you run them from.". Elsewhere (a browser behind `halonic serve`, a phone), the first line shall be "Studio can't set <name> here, or tell whether it's set. Halonic reads it on the computer running halonic serve. To save it, run this in a terminal on that computer:" and the last "Or set HALONIC_SECRET_<NAME> for Halonic on that computer.". The section's own Secrets row shall then be left out, so each name shows once. The page shall show no entry for the secret's value, and shall show no such lines for a connector over HTTP without a secret or for any other kind of connector.

## Examples

- Given the connector Tracker over HTTP with the secret `tracker-token`,
  when its page opens in the desktop app,
  then under "How it connects" it says "Studio can't connect to a server over HTTP yet, so only runs you start or continue with halonic in a terminal use tracker-token. Studio can't tell whether it's set. To save it, run this in a terminal:", shows `halonic secret set tracker-token`, then says "Or set HALONIC_SECRET_TRACKER_TOKEN in the terminal you run them from.", and shows no "Secrets" row.
- Given the same connector in a browser behind `halonic serve`,
  when its page opens,
  then it says "Studio can't set tracker-token here, or tell whether it's set. Halonic reads it on the computer running halonic serve. To save it, run this in a terminal on that computer:", shows the same command, then says "Or set HALONIC_SECRET_TRACKER_TOKEN for Halonic on that computer.".
- Given a connector over HTTP without a secret, or a local program connector,
  when its page opens,
  then it shows no such lines.
