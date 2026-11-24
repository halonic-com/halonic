# cloudflare-durable.usage-object

- Status: active
- Since: unreleased
- Source: HAL-13219; selling layer design, sections 4.3, 4.4 and 13.6

The usage object shall keep one scope's usage account in the Durable Object's own storage. The first call shall note the scope it is for, and a call for another scope, or for a scope other than the name the Worker gave the object, shall be refused before anything is stored. When the object has no limits document, or only one whose period has ended, it shall ask Cloud for one before a check, a reservation or a run start, and refuse with `plan.none` while it still has none for the current period, also when the pull fails. After a pull that found no limits, it shall not ask again for 30 seconds. Its alarm shall be set to the earlier of the next reservation to run out and the next run lease to end, and when it fires it shall charge the reservations that ran out, free the lost runs' slots and be set again. A value read from storage and changed in memory shall reach storage only when it is put, and a call that throws shall store nothing.

Rationale: the scope comes from the server, so a second scope in one object would mix two customers' use; a lost limits push must not leave a stopped customer running on the old period's quota; a scope with no plan must not send Cloud one request per refused step; a lost settle or a lost run must be cleared by the object itself, since no request may ever come for it.

## Examples

- Given an object that counts `u/acme`,
  when a call for `o/acme` arrives,
  then it is refused and nothing of it is stored.
- Given an object whose limits ended with their period and a Cloud that can't be reached,
  when a step is checked,
  then it is refused with `plan.none`.
- Given an object whose pull found no limits at 10:00,
  when a step is checked at 10:00:20,
  then it is refused without asking Cloud again.
- Given a reservation that runs out at 10:02 and a run whose lease ends at 10:01,
  when the alarm is set,
  then it is set for 10:01, and when it fires it is set again for 10:02.
