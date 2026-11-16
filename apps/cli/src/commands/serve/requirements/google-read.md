# cli.commands.serve.google-read

- Status: active
- Since: 0.1.0
- Source: HAL-10697 (served Studio: Google setup read and sign-in place from `halonic serve`); `server.google-setup-list`

The `halonic serve` command shall give the server the read-only Google setup ports (`googleRead`), so a served window can read the workspace's Google setups at `GET /api/google/setups` and say where its browser is. The setups are the records of this computer's profile whose link names the served workspace, each with the address and services of the connector it is linked to, read from the live version's connectors and the workspace's integrations at every request. A record linked to another workspace, or to a connector that is gone or isn't a Google one, shall be left out of the list and answer 404 on its own read. The command shall give the server no way to change a setup, start a sign-in or read a secret: sign-in is finished on this computer with `halonic google sign-in <ref>`.

Rationale: the setup records are kept per computer, but a served window shows one workspace, so it must not show another workspace's accounts, and a window that is not on this computer can't run Google's sign-in.

## Examples

- Given two records, one linked to the served workspace's Google connector and one to another workspace, then the list holds the first only.
- Given a record whose connector was removed from the workspace, then the list leaves it out and its own read answers 404.
- Given a request to start a sign-in or to save a client secret, then the server answers 404 `not_found`.
