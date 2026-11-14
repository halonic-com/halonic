# @halonicjs/host-server

The `Request → Response` handler behind `halonic serve` and the cloud Worker. `createServer` builds the handler with its security layer: the `Host` check (loopback names only when no password is set), the exact `Origin` check, strict response headers, a body limit enforced while the body streams, and errors that are a code and a short message. `GET /api/hello`, the sign-in routes, `GET /api/trust`, the routes that start, follow and steer a run, and `POST /api/chat-turn` (one model turn; agent settings name the API key's secret and never carry it, and a closed request aborts the model call) answer; every other path answers 404 for now. Web-standard APIs only, with every outside dependency behind a port.

- **Layer:** host
- **Owner:** elena
- **Public API:** `@halonicjs/host-server`

## Starting a run needs a trusted workspace

The server asks the host's trust gate before it starts any run, on every request. It keeps no answer from before, so a workspace that changed since you trusted it starts nothing.

- `POST /api/runs` starts a workflow and `POST /api/agent-runs` starts one agent. Both need a sign-in when a password is set and `Content-Type: application/json` (anything else answers 415).
- `GET /api/runs/<runId>` answers a run's summary, `POST /api/runs/<runId>/events` delivers an event (`{ event, payload?, callId? }`) and `POST /api/runs/<runId>/cancel` cancels. They need a sign-in when a password is set, and the two POSTs need `Content-Type: application/json`. Delivering an event needs a trusted workspace; cancelling does not.
- `GET /api/runs/<runId>/events?after=<seq>` streams the run's events as server-sent events: a `run` message per event with its `seq` as the id, then `end` when the run is over. A stream that closes without `end` broke, and the client asks again with the last `seq` (`after`, or a `Last-Event-ID` header, which wins). It needs a sign-in like the others and no trust.
- When the workspace isn't trusted (new, changed since it was trusted, unreadable or refused), both answer **403** with the code `workspace_not_trusted` and start nothing.
- When the trust check itself fails, both answer **500** with the code `internal_error` and start nothing. A failed check counts as no trust.
- A run on the test model isn't exempt. The CLI skips the trust check for a workspace that can only reach the test model; the server doesn't.
- A malformed start request gets 400 before the gate is asked.
- `GET /api/trust` shows the decision, read-only: its state and a short message, behind the sign-in. No route grants trust, saves a record or updates one. Only a person at the computer grants trust, with `halonic trust`.

The rule is the requirement `server.trust-gate`.

## Harness agents run on the host

An agent in a harness (Claude Code or Codex) runs on the machine the server runs on, through the host's own engine, in the host's sandbox. A start request can't change that: `POST /api/runs` and `POST /api/agent-runs` answer **400** (`bad_request`) when the body names `harness`, `placement`, `sandbox`, `profile`, `workingFolder` or `allowedSites`, and start nothing. The gate and the sign-in apply as for any start. The rule is the requirement `server.harness-on-host`.

## Daily request ceiling

A deployment can cap how many requests its server answers per UTC day. Set `limits.dailyRequests` on the deployment in `deployments.yaml` (a whole number above zero). There is no default: with no `dailyRequests`, nothing is counted and nothing is capped. The ceiling is the same on `halonic serve` and on Cloudflare.

- Every request that passes the `Host` and `Origin` checks counts, whether or not the caller has signed in. That includes `GET /api/hello` and the sign-in routes, so a caller who isn't signed in can use up the day.
- A request refused by the `Host` or `Origin` check doesn't count.
- A request past the ceiling gets status 429 with the code `daily_limit_reached` and a `Retry-After` header: the whole seconds until the next UTC midnight. It never reaches a route, so it never starts a run.

## `GET /api/hello`

Answers 200 without a sign-in, with exactly three keys:

```json
{ "product": "halonic", "version": "0.1.0", "minAppVersion": "0.1.0" }
```

`version` is the server's version and `minAppVersion` is the oldest Android app this server works with. The Android app calls the route before it opens the sign-in page, to check it can talk to this server. It tells nothing else: no workspace name, host name or user. It sits behind the same `Host` and `Origin` checks and the same ceiling as every other route.

## Example

```ts
import { createServer, type ServerOptions } from "@halonicjs/host-server";

// A host builds a server from its config and ports, then hands each request to `handle`.
declare const options: ServerOptions;
const server = createServer(options);
const response = await server.handle(
  new Request("http://localhost/api/hello", { headers: { host: "localhost" } }),
);
```
