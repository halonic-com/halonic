# server.cloud-commands

- Status: active
- Since: unreleased
- Source: HAL-13553 (selling layer S2-20), plan approved on the task; Cloud's `control-plane.command-schedule` and `control-plane.command-kinds`

When a server has Halonic Cloud's inbox ports, it shall answer `POST /api/cloud/commands` only for a request the host's Cloud check accepts: signed in the `cloud-to-deployment` direction with one of Cloud's pinned `command` keys for the deployment's own product, inside the time window, and with a nonce the check records before the command is acted on, so the same request is never accepted twice. Every refused check shall answer the same 401 `unauthorized`, and nothing shall be acted on before the check holds. The body shall be JSON with exactly `id`, `kind`, `sequence` and `payload`, the `id` 1 to 128 printable ASCII characters and equal to the signed command id, the `kind` one the server carries out and the payload valid for that kind; anything else shall answer 400 `bad_request` and act on nothing.

The server shall carry out a command id once. A try shall first claim the id for the lease its kind sets: a finished id shall answer 200 `{"command":"done"}` without acting again, an id whose running try still holds its lease shall answer 409 `command_running`, and an id whose lease ran out shall pass to the new try, which runs the command again from the start. A try whose work fails shall let the id go and answer 500, so Cloud's next try runs it. A try whose work isn't finished shall keep its claim and answer 409. Every handler shall be safe to run twice. Two handlers for the same kind shall stop the server from being built.

A `product.state` command shall carry a whole `sequence` of 0 or more and a payload of exactly `state` (`draft`, `live` or `paused`) and `changedAt` (an ISO time). The server shall keep the state, sequence and time, unless it already keeps the same sequence or a larger one, and answer 200 either way.

While the kept state is `paused`, the server shall answer every request but Cloud's commands with 503 `app_paused`, from one check before any route, so Cloud can still resume it. Before Cloud's first `product.state`, and on a server without the inbox ports, nothing shall be closed.

Rationale: Cloud tries a command again until it gets a 2xx and its tries can overlap, so the id is claimed with a lease: an overlapping try can't confirm work that later fails, and a try cut off mid-command doesn't block the id until Cloud gives up.

## Examples

- Given a request the Cloud check refuses, then the answer is 401 and the ledger is never asked.
- Given a body whose `id` isn't the signed command id, then the answer is 400.
- Given `product.state` with `state` = `paused` and sequence 3, then the server keeps it, and a later request to `/api/hello` answers 503 `app_paused` while a `product.state` with `live` and sequence 4 is still carried out.
- Given a finished id sent again, then the answer is 200 and nothing runs.
- Given an id whose running try's lease still holds, then the answer is 409; once the lease ran out, the next try runs it.
