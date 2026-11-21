# contracts.remote-control

- Status: active
- Since: unreleased
- Source: tunnel phase B build plan, decision 13 (HAL-12232); tasks HAL-12235, HAL-14060 and HAL-12385; requirement `ports.remote-control`

Where a host implements `RemoteControl`, it shall pass this suite. A new host shall offer remote with remote off, the tunnel `down` with `stopped`, no phone, no pairing and the risky switch off. It shall turn remote on and off, and set the risky switch while remote is off. A pairing shall turn remote on and begin with a 12-symbol code, a QR text starting `halonic-pair:`, the host's name and when the code ends; closing it unpaired shall end it with `closed` and turn remote off again. A second pairing while one is open shall end at once with `busy` and leave the first open. Allow and Don't allow shall be refused before a phone used the code. Once a phone used it, the pairing shall show a 6-symbol check code with the phone's name and platform; Allow shall pair the phone, and Don't allow shall end the code with `denied`, pair nothing and keep the pairing open and remote on until it is closed. `newCode` shall give a different code on the same pairing, with remote on in every state in between, and a phone that then uses it shall pair; asked for while a phone waits at `check`, it shall refuse that phone; once the pairing has ended, it shall be refused. Turning remote off shall end an open pairing with `remote-off`. A phone whose name a paired phone has shall get " (2)". Phones shall stay paired, not connected, while remote is off. `revoke` shall unpair one phone and do nothing for an id that isn't paired, and `revokeAll` shall unpair every phone. The pairing rules shall be `pairingRules`, driven through the harness, which plays the phone and moves the host's time: a code no phone used shall end with `code-expired` when its life is over and take a phone until then; a used code shall wait for Allow until the wait is over, then end with `allow-timed-out`; a new code shall have a life of its own. A code shall count its wrong tries down and end with `too-many-tries` at the last, and a try shall then be refused as `code-ended`, or as `code-used` while a phone waits at `check`. Once the host has had a minute's failed tries across codes, it shall refuse every try as `rate-limited` until the first of them is a minute old, and those refusals shall not count against the code.

## Examples

- Given a new host,
  when a pairing is opened and closed without a phone,
  then the pairing ends with `closed` and remote is off again.
- Given an open pairing,
  when a second pairing is opened,
  then the second ends at once with `busy` and the first stays open.
- Given a phone named "Pixel 8" that used the code,
  when Allow is pressed,
  then the pairing ends with `paired` and the list holds "Pixel 8".
- Given an open pairing that turned remote on,
  when a new code is asked for,
  then the pairing shows a different code and remote never goes off in between.
- Given a phone that used the code,
  when Don't allow is pressed,
  then the code ends with `denied`, remote stays on, and a new code can pair another phone.
- Given a paired "Pixel 8",
  when a second phone named "Pixel 8" is paired,
  then it is listed as "Pixel 8 (2)".
- Given an open pairing no phone has used,
  when the code's life is over,
  then the code ends with `code-expired` and the pairing stays open for a new code.
- Given an open pairing,
  when a phone has the last wrong try the code takes,
  then the code ends with `too-many-tries`, and a new code takes them all again.
- Given a minute's failed tries over two codes,
  when a phone tries the third code,
  then it is refused as `rate-limited` until the first of them is a minute old.
- Given three paired phones,
  when one is revoked twice and an unknown id once,
  then two phones are left, and `revokeAll` leaves none.
