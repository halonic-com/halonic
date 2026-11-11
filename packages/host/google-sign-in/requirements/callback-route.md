# google-sign-in.callback-route

- Status: draft
- Since: 0.1.0
- Source: code review of 11 Nov (HAL-5219), threat model 4.5; the route is HAL-699

The callback route for Google sign-in shall be a one-shot server bound only to `127.0.0.1` that closes after the first valid callback or after a time limit, refuse a request whose `Host` header isn't the host and port it was started with, escape everything it takes from the query when it answers with a page, and keep the callback URL, with its code and `state`, out of every log. The library already does the rest: it checks `state` first, takes the pending sign-in once, and exchanges the code.

## Examples

- Given a started callback server,
  when a request arrives with `Host: attacker.example`,
  then it is refused and the pending sign-in is untouched.
- Given a callback with `error=<script>`,
  when the server answers with a page,
  then the page shows no unescaped markup from the query.
- Given a callback that finished a sign-in,
  when another request arrives,
  then nothing listens any more.
- Given any callback,
  when the server's logs are read,
  then none holds the code or the `state`.
