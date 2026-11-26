# connections.engine-row

- Status: draft
- Since: unreleased
- Source: HAL-18747 (S8b); HAL-19918 (the host's names and the Offline state); Sofia's flow on HAL-18622, Noah's screen on HAL-18623, Mara's copy check on HAL-18641; `services.server-engine`

Where the host serves the server engine, Settings › Connections shall start with a "Messaging engine" row offering This computer and Server, with the workspace's engine picked. Picking Server shall open Pair with a server and keep This computer picked until the host paired. Picking This computer while on Server shall ask first and then end the pairing, and say whether the pairing ended on the server too or is still valid there; the still-valid text shall name this computer as it paired in this visit to Settings › Connections, or else as the host's setting kept it, or "Halonic Studio" when neither knows, never by the computer's own name. Pair with a server shall fill in the name this computer paired as, from this visit or the host's setting, or else the computer's name the host gives, or else "Halonic Studio". Under Server, the row shall show the server's host and Connected while this computer keeps the pairing, with the check time and the pairing's end once this window paired; Offline with "Offline, as of 14:02" and the attention callout "The server isn't answering. Inbox and Messenger show what was read last; answering is off until it's back." while the host's last call to the server failed; Signed out with Pair again while the keychain holds no pairing; and the keychain callout with Pair again when the keychain couldn't be read. Where the host has no keychain, Server shall be listed but unavailable, with its reason. No answer the row shows holds the device token.

## Examples

- Given a paired workspace whose server timed out at 14:02,
  when Settings › Connections opens,
  then the row shows Offline, "Offline, as of 14:02" and the attention callout.
- Given a workspace the host says was paired as "Work laptop", and a server that can't be reached,
  when the person switches back to This computer,
  then the row says to remove Work laptop with `halonic serve devices`.

- Given a workspace whose engine is Server and whose keychain can't be read,
  when Settings › Connections opens,
  then the row says "Halonic couldn't read this computer's pairing from the keychain." with Pair again.
- Given a host without a keychain,
  when Settings › Connections opens,
  then Server can't be picked and says it needs this computer's keychain.
- Given a workspace on Server whose server can't be reached,
  when the person picks This computer and confirms,
  then the row is on This computer and says the pairing is still valid on the server.
