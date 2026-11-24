# Decision: the closed check and the round trip ask again after the edge's hiccups

- Approval: /HAL/issues/HAL-17705
- Kind: internal

## What changes

- `cloudflare-live.transfer`: the closed check (`workerChecks.adminClosed`) starts its sweep again when the unknown path or an admin route answers a 5xx, up to 4 tries in all with 5 s between them, as the smoke check does. A 5xx on the unknown path now fails as that path's own answer ("GET /no-such-path was answered 500 …, expected 404") instead of being taken as the answer every route must match. Any other difference, such as a 401 where the unknown path answers 404, still fails at once.
- `cloudflare-live.transfer`: the round trip (`roundTrip`) starts the transfer again, up to 4 tries in all, when it is answered `The Worker answered 404` (`transfer-failed`), which an older Worker version without the key gives. It empties the export folder before each try. A 401, any other refusal or a file that comes back different still fails at once.
- No test is removed or weakened: the new cases are in `transfer-retries.test.ts`, and the existing tests in `transfer-checks.test.ts` pass unchanged.

## Why

Merge-group run 45446845224 (24 Nov, 17:17 UTC) failed in `live/transfer.live.test.ts` while no PR in the group touched the Worker or the live suite. The closed check's unknown-path call got a 500 from Cloudflare's edge while the admin route got the Worker's 404, and in the same run the round trip's import got a 404 from an older version without the key after the key wait had passed several times in a row. Both are the edge answering from mixed Worker versions, and the round trip's import is safe to send again (it is sent twice already).

## Tests

New tests in `transfer-retries.test.ts`: the closed check passes after one 500 on the unknown path, gives up naming the route after four 500s, and fails at once on a 404-vs-401 mismatch with no wait; the round trip passes after one 404 on the import, fails at once on a 401 naming no key, and gives up after four 404s. Package tests pass (88 in `testing-cloudflare-live`).

## Covers

- cloudflare-live.transfer
