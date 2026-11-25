# server.messaging-client

- Status: draft
- Since: unreleased
- Source: HAL-17512 `server-engine` rev 2, §1 and §7 (PR S3); Julian's security note on HAL-17513, finding S3; ADR `docs/adr/2026-11-24-agent-messaging.md`, server engine (b)

When the desktop's messaging engine is a server, `ServerAgentMessaging` shall carry every call of the `AgentMessaging` port (`ports.agent-messaging`) to that server's `/api/messaging/*` routes (`server.messaging-routes`). The client shall send the device's token only in the `Authorization: Bearer` header. The client shall refuse, before it sends anything, an address that isn't `https` or plain `http` to this computer (`localhost`, `127.0.0.1`, `::1`), or that holds a user name, a password, a path, a query or a fragment. If the server answers with a redirect, the client shall follow it to no address, same host included, and shall throw. If the server answers 401, the client shall list the server's sources as `signed-out` and refuse a write as `signed-out`. If the server can't be reached, the client shall list its sources as `offline` and refuse a write as `offline`. No error the client throws shall hold the token, a header or the body of an answer.

Rationale: the device token signs the desktop in to the board's server, so it may cross a network only encrypted, and only to the address the person paired with.

## Examples

- Given `FakeAgentMessaging` behind the server's routes and a paired device's token,
  when the `AgentMessaging` contract tests (`contracts.agent-messaging`) run against the client,
  then they pass.
- Given a server that answers every call with a redirect,
  when the client lists its sources,
  then it throws and the server got one request.
- Given the address `http://halonic.acme.example`,
  when the client is made,
  then it throws and nothing is sent.
- Given a token the server doesn't know,
  when the client lists sources and sends a message,
  then the sources read `signed-out` and the send is refused as `signed-out`.

## What it doesn't cover

How the device gets its token is `server.device-pairing`, and where the desktop keeps it is the Studio pairing dialog's task (HAL-17512, S8).
