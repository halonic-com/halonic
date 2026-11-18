# contracts.remote-control

- Status: active
- Since: unreleased
- Source: tunnel phase B build plan, decision 13 (HAL-12232); task HAL-12235; requirement `ports.remote-control`

Where a host implements `RemoteControl`, it shall pass this suite. A new host shall offer remote with remote off, the tunnel `down` with `stopped`, no phone, no pairing and the risky switch off. It shall turn remote on and off, and set the risky switch while remote is off. A pairing shall turn remote on and begin with a 12-symbol code, a QR text starting `halonic-pair:`, the host's name and when the code ends; closing it unpaired shall end it with `closed` and turn remote off again. A second pairing while one is open shall end at once with `busy` and leave the first open. Allow and Don't allow shall be refused before a phone used the code. Once a phone used it, the pairing shall show a 6-symbol check code with the phone's name and platform; Allow shall pair the phone, connected, and Don't allow shall end with `denied`, pair nothing and turn remote off again. Turning remote off shall end an open pairing with `remote-off`. A phone whose name a paired phone has shall get " (2)". Phones shall stay paired, not connected, while remote is off. `revoke` shall unpair one phone and do nothing for an id that isn't paired, and `revokeAll` shall unpair every phone.

## Examples

- Given a new host,
  when a pairing is opened and closed without a phone,
  then the pairing ends with `closed` and remote is off again.
- Given an open pairing,
  when a second pairing is opened,
  then the second ends at once with `busy` and the first stays open.
- Given a phone named "Pixel 8" that used the code,
  when Allow is pressed,
  then the pairing ends with `paired` and the list holds "Pixel 8", connected.
- Given a paired "Pixel 8",
  when a second phone named "Pixel 8" is paired,
  then it is listed as "Pixel 8 (2)".
- Given three paired phones,
  when one is revoked twice and an unknown id once,
  then two phones are left, and `revokeAll` leaves none.
