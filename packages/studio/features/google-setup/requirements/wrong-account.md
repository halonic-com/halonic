# google-setup.wrong-account

- Status: active
- Since: unreleased
- Source: HAL-714; google-setup-flow (HAL-621) section 3.5 item 3 and section 5.1; ux-checklists (HAL-1019) section 4.4; HAL-9901

While the setup record says the last sign-in came back for another account (`wrongAccountAt`), the open step 7 shall say "You signed in as *other@example.com*, but this connector is for *x@example.com*. Sign in again and choose *x@example.com*." and offer "Use *other@example.com* for this connector instead", which changes the connector's address and nothing else. The other address comes from the host's memory, where it stays 10 minutes: when the host no longer has it, or can't answer, the step shall say "The sign-in didn't match this connector, so nothing was saved. Sign in again and choose *x@example.com*." with no link and no other address. The sign-in button shall read **Sign in again**. A waiting sign-in that comes back for another account shall end in this note, not in "The last sign-in didn't finish." When the link fails the step shall say "Couldn't change the connector's address: *reason*." The record never holds the other address, and Studio shall not keep it beyond the note.

## Examples

- Given a record with `wrongAccountAt` and a host that remembers other@example.com,
  when step 7 opens,
  then the note names both addresses and the button reads **Sign in again**.
- Given a host that forgot the address,
  when step 7 opens,
  then the note says the sign-in didn't match and has no link.
- Given the link is chosen,
  then the host is asked to change the connector's address to the other one.
