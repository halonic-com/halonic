# integration-kit.secret-in-request

- Status: active
- Since: 0.1.0
- Source: HAL-994 (I5 design v0.2 on HAL-958, section 3.6; Julian's ruling in HAL-972; attack case A25)

The kit shall refuse with `secret-in-request`, and send nothing, a request whose method, URL, headers or body holds the value of one of the integration's secrets that the kit didn't put there itself. That applies to every declared secret that is set up, whether the request places it or not, in any form the secret filter matches (raw, URL-encoded, form-encoded, JSON-escaped) or percent-encoded in part in the URL or a text body, to any host, including one the secret is declared for. A redirect whose `Location` holds such a value, in the same forms, shall not be followed: the kit refuses it with its own code, `secret-in-redirect`, because the server chose that URL, not the integration, and names the two hosts only, with any secret removed. No other request option reaches the transport, so a `referrer` holding the value never goes out. The kit reads the integration's request once and checks and sends that copy, so changing the request after the call, through a getter or the integration's own `Headers`, form or byte array, can't add the value. A URL that isn't plain text is refused without being turned into text, so it can't give the check one URL and the log another. A placement that isn't in the sheet is refused before any secret value is read. Neither the refusal message nor the request log shall hold the value: they name the host only, with any secret removed, and a request that fails before the check has run logs no method, host or path. The check covers only those forms: a value the integration has transformed in any other way, such as base64 or a change of case, is not caught. The kit shall also remove every declared secret, not only the placed ones, from the responses it hands back.

## Examples

- Given `example-key` that a server echoed in a form the filter missed,
  when the integration puts the value in the query, the path, a header of its own, a text, form or byte body, or the method, raw or encoded,
  then the kit throws `secret-in-request`, and the transport sees nothing.
- Given the same value,
  when the integration sends it to `cdn.example.com`, which the secret isn't declared for, or to `api.example.com`, which it is,
  then the kit refuses both.
- Given `client-secret`, which this request doesn't place,
  when the integration puts its value in a request to `api.example.com` that places `example-key`,
  then the kit refuses it.
- Given a server whose redirect `Location` holds the value,
  when the kit gets the redirect,
  then it throws `secret-in-redirect`, sends nothing more, and the request log names the integration's own request.
- Given the value with one character percent-encoded,
  when the integration puts it in the query next to a malformed escape such as `%ZZ`, or in a form text body,
  then the kit refuses it.
- Given a refused request with the value in the host or the path,
  when the error and the request log are read,
  then neither holds the value, also when the body is one the kit refuses on its own.
- Given a secret store that fails,
  when the integration sends a request with the value in the host or the path,
  then the request log holds no method, host or path for it.
- Given the value in the path of a `referrer`,
  when the integration sends a request with it,
  then the transport sees no `referrer`.
- Given a request whose headers, body or method is a getter that gives a clean value first and the value after,
  or whose `Headers`, form or byte array the integration changes to hold the value right after calling `fetch`,
  when the kit sends it,
  then each option is read once and the transport gets the clean request the kit checked.
- Given `example-key` placed by the kit as a bearer token,
  when the integration sends an otherwise clean request,
  then it goes out as before.
