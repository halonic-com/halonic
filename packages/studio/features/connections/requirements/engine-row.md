# connections.engine-row

- Status: draft
- Since: unreleased
- Source: HAL-18747 (S8b), HAL-19698 (S8c); Sofia's flow on HAL-18622, Noah's screen on HAL-18623, Mara's copy check on HAL-18641; `services.server-engine`

Where the host serves the server engine, Settings › Connections shall start with a "Messaging engine" row offering This computer and Server, with the workspace's engine picked. Picking Server shall open Pair with a server and keep This computer picked until the host paired. Picking This computer while on Server shall ask first and then end the pairing, and say whether the pairing ended on the server too or is still valid there. Under Server, the row shall show the server's host and what the host's state says, also after Studio starts again: Connected with the check time and the pairing's end ("Checked 14:02 · pairing ends 23 Feb 2027") while the server answers; Offline with "Offline, as of 14:02" and the server's offline callout while it doesn't; Signed out with Pair again while the keychain holds no pairing or the server ended it; and the keychain callout with Pair again when the keychain couldn't be read. Pair with a server shall fill in this computer's name as the host gives it, and the texts that tell the person to remove this computer on the server shall name it as it paired, "Halonic Studio" only when the host knows neither. Where the host has no keychain, Server shall be listed but unavailable, with its reason. No answer the row shows holds the device token.

## Examples

- Given a workspace whose engine is Server and whose keychain can't be read,
  when Settings › Connections opens,
  then the row says "Halonic couldn't read this computer's pairing from the keychain." with Pair again.
- Given a host without a keychain,
  when Settings › Connections opens,
  then Server can't be picked and says it needs this computer's keychain.
- Given a workspace on Server whose server can't be reached,
  when the person picks This computer and confirms,
  then the row is on This computer and says the pairing is still valid on the server.
- Given a workspace paired as "Work laptop" whose server can't be reached,
  when the person switches back to This computer,
  then the callout says "Remove Work laptop with `halonic serve devices`", not "Halonic Studio".
- Given a workspace on Server whose server doesn't answer,
  when Settings › Connections opens after Studio started again,
  then the row shows Offline, "Offline, as of 14:02" and "The server isn't answering."
