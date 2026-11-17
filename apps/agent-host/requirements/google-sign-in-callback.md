# agent-host.google-sign-in-callback

- Status: active
- Since: unreleased
- Source: HAL-9409; Liam's decision on HAL-10018

When Google sends the browser back to the agent host's `/api/google/callback`, the agent host shall finish the sign-in the request's `state` belongs to without asking for the launch token, because a browser that follows a redirect can't send one, and shall answer with the fixed page of the host server, never text from the request. The agent host shall serve without the token only a route that says so, and shall still refuse such a request whose `Host` isn't its own loopback address and port, or that has an `Origin` header. A request to any other path, or one that names a path without that setting, still needs the token.

## Examples

- Given a started sign-in,
  when the browser opens the redirect address from the sign-in's address with no launch token,
  then the agent host answers the page, and the page is not an error.
- Given a callback request with a `state` that no sign-in started,
  when the host reads it,
  then the page says the link is no longer valid and nothing is saved.
- Given a callback request addressed to another host name,
  when the host reads it,
  then the answer is 421.
- Given a callback request with an `Origin` header,
  when the host reads it,
  then the answer is 403.
- Given a path other than the callback with no token,
  when the host reads it,
  then the answer is 401.
