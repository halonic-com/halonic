# cli.commands.serve.request-log

- Status: active
- Since: unreleased
- Source: HAL-19106 (S9 follow-up); the board's condition 3 on HAL-18503, logging on the pairing endpoint; HAL-18504

When a request to the server finishes, the `halonic serve` command shall print one line on stdout with the request's method, path and status, such as `POST /api/pair 429`, so that every pairing try, allowed, refused or over the login limit, reaches the serve log (journald under systemd). The line shall hold no query string, no header and no body, so a pairing code, a pending ID, a device token or a password never appears in it, and a route that takes a secret or a key shall get no line at all. A method or path shall be made printable before it is shown.

Rationale: an operator can see guessing at the pairing code, and the 429 that stops it, in the log of the computer that serves, without the log ever holding what was guessed or given.

## Examples

- Given a running `serve` with a sign-in password, when a device sends `POST /api/pair` with a wrong code 11 times, then stdout has 10 lines `POST /api/pair 401` and one `POST /api/pair 429`, and the code it sent appears neither on stdout nor on stderr.
- Given the same server, when a caller sends `GET /api/hello?probe=1`, then stdout has the line `GET /api/hello 200`, without the query.
