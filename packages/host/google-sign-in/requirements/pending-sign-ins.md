# google-sign-in.pending-sign-ins

- Status: active
- Since: 0.1.0
- Source: HAL-699 (plan D5, section 3; Liam's review of #273)

The sign-in shall keep each server's pending sign-ins in memory in a holder of its own, at most one per account, so that a new start replaces the account's earlier one; it shall find a pending sign-in by comparing the callback's `state` with every pending `state` in constant time, remove the match when it is taken, treat a match from 10 minutes or more after its start as none, and leave every pending sign-in whose `state` didn't match in place.

## Examples

- Given a pending sign-in,
  when its `state` is taken twice,
  then the first take returns it and the second returns nothing.
- Given two starts for one account,
  then only the second one's `state` and auth URL count.
- Given a sign-in started at 12:00,
  when it is taken at 12:09:59.999,
  then it is returned; taken at 12:10 instead, it is removed and nothing is returned.
- Given a `state` that differs in one character,
  then nothing is returned and the pending sign-in stays.
