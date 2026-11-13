# sign-in.flow-attacks

- Status: active
- Since: 0.1.0
- Source: HAL-8618 (HAL-984 design, section 8: attack cases T7 to T10 and T19 to T21)

The sign-in flow shall keep the code, the client secret and the tokens inside the sign-in the user approved, whatever a provider or a browser callback does: it shall send a token request only to the approved token endpoint and never follow a redirect, refuse a callback that is not the one the pending sign-in waits for (a wrong or missing `state`, a code that was not issued or was used, a wrong `iss`, a path nothing waits at, a sheet or a setting that changed, an expired sign-in), save nothing from a token answer that is not a bearer token with usable tokens or that is too large, and show a page that repeats nothing the request carried.

## Examples

- Given a token endpoint that answers 307 to another host, even through a client that follows redirects,
  when the code is exchanged, a token is refreshed or a token is revoked,
  then nothing reaches the other host and no grant is saved or changed by the answer.
- Given an `authorizeUrl` that sets `redirect_uri`, `state`, `code_challenge` or another parameter Halonic sets, in any case or encoding,
  then the sheet is refused.
- Given a callback with a wrong, missing or foreign `state`, or on a path nothing waits at,
  then nothing is sent to the token endpoint and the page is a plain 400.
- Given a code nobody issued, a code used before, or a code from an earlier sign-in,
  then the sign-in is refused and nothing is saved.
- Given a sheet with an `issuer`, when the callback has another `iss` or none, or given a sheet without one when the callback has an `iss` that is not the authorize URL's origin,
  then the sign-in is refused before any exchange.
- Given a token answer whose `token_type` is not bearer or whose `access_token` is missing, empty, short, spaced, split over lines or not visible ASCII, or whose `refresh_token` is,
  then nothing is saved.
- Given a token answer over 64 KiB,
  then nothing is saved.
- Given a callback that arrives after the sheet's token endpoint or the client changed, after the pending sign-in expired, or after the sign-in started again,
  then it is refused and the exchange never uses another token endpoint than the approved one.
- Given an `authorizeUrl` with `&`, `|` and quotes in its extra parameters,
  then the flow gives one URL that holds no space, quote or line break, and the provider reads the parameters as they were written.
