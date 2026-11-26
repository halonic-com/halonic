# connections.server-pair-dialog

- Status: draft
- Since: unreleased
- Source: HAL-18747 (S8b); Sofia's flow on HAL-18622, Noah's screen on HAL-18623, Mara's copy check on HAL-18641; `agent-host.server-engine-pairing`

When the person picks Server in the Messaging engine row, or presses Pair again, the Studio window shall open a dialog titled "Pair with a server" or "Pair again" that asks for the server's address, the pairing code and this computer's name, refuses an address that isn't https (nor plain http on this computer) and a code that isn't 8 symbols of the pairing alphabet before sending, and then asks the host to pair. While the pairing waits, the dialog shall show the check code, "Waiting for Allow on the server…" (or "Can't reach the server. Still trying…" while the server doesn't answer) and the time left, and ask the host where it stands every 2 seconds. When the server allowed this computer, the dialog shall close and hand the pairing's end date to the row. When it ended otherwise, the dialog shall say why (expired, refused, another request used the code, the keychain didn't take it with or without ending the pairing on the server, or the pairing didn't finish) with Close and Start again. When the host refused the start, it shall say why under the address or the code, and keep Continue off after too many wrong codes until the wait is over. Closing the dialog while a pairing waits shall cancel it. The dialog shall get only the host's route answers, never the device token.

## Examples

- Given a server that starts a pairing with the check code `4F72KQ`,
  when the person enters its address and `7kq2-m9xf` and presses Continue,
  then the host is asked with the code `7KQ2M9XF`, and the dialog shows the check code and "10:00 left".
- Given a waiting pairing,
  when the owner refuses it on the server,
  then the dialog shows "The server didn't allow this computer" with Start again.
- Given a server that answers too many wrong codes with 5 minutes,
  when the person presses Continue,
  then the code field says "Too many wrong codes. Try again in 5 minutes." and Continue is off for 5 minutes.
- Given a waiting pairing,
  when the person presses Cancel and the server can't be told,
  then the dialog closes and the row says it couldn't cancel the pairing.
