# integration-kit.leak-attempt-codes

- Status: active
- Since: 0.1.0
- Source: HAL-1180 (asked on HAL-1133: the bridge should pause a connector on any of these codes, not on `secret-in-request` alone)

The kit shall export `leakAttemptCodes`, the refusal codes that mean the integration tried to get a secret out: `secret-in-request` and `placement-not-in-sheet`. Every code in the list shall be a refusal code the kit really throws. Ordinary refusals, where the request is wrong but no secret is going anywhere, such as `host-not-allowed` or `request-too-large`, shall stay out of it. The list can't be changed at run time.

## Examples

- Given an integration that puts `example-key` in its own query,
  when the kit refuses it,
  then the code is `secret-in-request`, which is in the list.
- Given an integration that asks for `example-key` in the header `x-note-title` while the sheet says bearer,
  when the kit refuses it,
  then the code is `placement-not-in-sheet`, which is in the list.
- Given a request to a host the sheet doesn't list, or a body over the limit,
  when the kit refuses it,
  then the code is not in the list.
