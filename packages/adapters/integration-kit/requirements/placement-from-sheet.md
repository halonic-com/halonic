# integration-kit.placement-from-sheet

- Status: active
- Since: 0.1.0
- Source: HAL-1090 (Julian's security review on HAL-1081, T14, decided on HAL-1085; attack case A40)

The kit shall place a secret only the way the permission sheet says: the same `as`, the same `header` ignoring ASCII case, the same `prefix` (a missing prefix and `""` count as the same), and the same form `field`, with case. Any other placement shall be refused with `placement-not-in-sheet` before a secret value is read and before anything is sent, on the first hop, so a redirect doesn't change the result. The message shall name the secret, the sheet's placement and the code's placement, never the value. The kit is the same in-process and fenced, so the rule holds in both.

## Examples

- Given a sheet that puts `example-key` in the header `x-api-key`,
  when the integration asks for it in `x-other-key`, in a form field, or as a bearer token,
  then the kit throws `placement-not-in-sheet`, reads no secret and sends nothing.
- Given the same sheet,
  when the integration asks for it in `X-Api-Key`,
  then the kit places it.
- Given a sheet that puts `example-key` in `x-api-key` after `Key `,
  when the integration asks for another prefix or none,
  then the kit refuses it.
- Given a sheet that puts `example-key` in `x-api-key` with no prefix,
  when the integration gives the prefix `""`,
  then the kit places it.
- Given a sheet that puts `example-key` as a bearer token,
  when the integration asks for the header `authorization` after `Bearer `,
  then the kit refuses it.
- Given a sheet that puts `client-secret` in the form field `client_secret`,
  when the integration asks for `Client_Secret` or `note_title`,
  then the kit refuses it.
- Given a placement that doesn't match and a server that would redirect,
  when the integration sends the request,
  then the kit refuses it before the first hop. A matching placement is placed again on a redirect to the same host.
- Given a refused placement,
  when the error is read,
  then it names `example-key`, where the sheet puts it and where the code asked, and doesn't hold the value.
