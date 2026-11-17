# @halonicjs/testing-tunnel-attacks

Attack tests against the remote gateway as a tunnel reaches it. A rig puts the real gateway listener behind a forwarder
that stands where a tunnel stands (it takes a connection from anywhere and opens one to the gateway's loopback port), with the
fake `TunnelProvider` telling the tunnel's name. The tests then attack it the way a hostile client or a web page would.

- **Layer:** testing
- **Owner:** julian
- **Public API:** `@halonicjs/testing-tunnel-attacks`
- **Where each attack case is tested:** [attack-cases.md](attack-cases.md)

## What is in it

- `openTunnelRig`: the gateway on a recording session source, a started fake tunnel, and the forwarder. `rig.client()` is a raw
  client that reaches the gateway through the forwarder; `rig.greeted()` has done the handshake and hello.
- `RecordingSource`: the host's side of the gateway, in memory. It records every prompt and approval answer the gateway passes
  on, so a test can say a hostile client changed nothing.
- `WireClient`, `wireFrame`: a client that sends any bytes, such as an unmasked frame or a lying length, and reads the frames back.

## Example

A web page's request is refused even though it reaches the gateway from loopback, as a tunnel's does:

```ts
const rig = await openTunnelRig();
const client = rig.client();
const status = await client.handshake(rig.forwarderPort, {
  host: rig.tunnelName,
  headers: ["Origin: https://evil.example"],
});
// status is "HTTP/1.1 403 Forbidden", and rig.source.calls is empty.
await rig.stop();
```

Every name in the tests is fake: tunnel names end in `.invalid` and attacker names are on `example`.
