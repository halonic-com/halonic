# studio.src-tauri.crates.phone-tunnel.phone-tunnel-connections

- Status: draft
- Since: unreleased
- Source: HAL-15157 (D6) rules 3 and 4; design decision 7 on HAL-12206 (Removed and Can't confirm); the `PhoneTunnel` port agreed with Elena on HAL-15166

When the page connects to a listed computer, the phone shall open one connection to it at the first of its endpoints that opens, and answer `connecting`, or why not as a typed problem: not paired, can't reach with the reason, the local network permission turned down, or a key that no longer opens. A second connect shall open no second connection; when the phone waits to reconnect, it shall try at once. It shall pass every status change on, and while reconnecting it shall say when the next try starts. When the computer can't be confirmed, it shall clear nothing. When the computer has proved who it is and said the phone isn't paired, the phone shall wipe its key and the pinned key before it says Removed, and keep the computer listed until the person forgets it. Forgetting a computer shall end its connection and wipe its key and its details.

## Examples

- Given a connected computer that says `not-paired` inside the session,
  when the page hears Removed,
  then the phone's key for it and the pin are already gone, and connecting again answers `not-paired`.
- Given a computer whose host key changed,
  when the phone connects,
  then it says Can't confirm and keeps the key.
- Given a connection that drops,
  when the phone reconnects,
  then it says Reconnecting, then when the next try starts.
- Given a connected computer,
  when the person forgets it,
  then the connection ends and neither its key nor its details are kept.
