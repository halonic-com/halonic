# @halonicjs/adapter-e2e-noise

The agent host's end of the end-to-end session with a phone: Noise from `snow`, the library the
phone uses, built to WebAssembly, and the hashes around the pairing handshake. It follows the ADR
"Pairing and the end-to-end session" and requirement `ports.remote-gateway-session`. The remote
gateway (B3) and the pairing service (B2) use it.

- **Layer:** adapters
- **Owner:** owen
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-e2e-noise`

## Use

```ts
import { checkCode, NoiseSession, pairingPsk } from "@halonicjs/adapter-e2e-noise";

// The host answers a phone's pairing handshake. Both keys are zeroed once the session has them.
const session = NoiseSession.start({
  handshake: "pairing",
  role: "responder",
  localPrivateKey: hostPrivateKey,
  psk: pairingPsk("XX7A9Q36KFB3"),
});
session.readMessage(message1);
const message2 = session.writeMessage(new TextEncoder().encode('{"hostName":"Desk"}'));
const payload3 = session.readMessage(message3);
const shown = checkCode(session.handshakeHash()); // the same 6 symbols as on the phone
// ... transport messages with writeMessage and readMessage, rekeyOutgoing and rekeyIncoming
session.end();
```

- **Handshakes:** `pairing` is `Noise_XXpsk3_25519_ChaChaPoly_SHA256`, with the psk from the code.
  `reconnect` is `Noise_IK_25519_ChaChaPoly_SHA256`, where the phone's initiator passes the pinned
  host key. The prologue is `halonic-gateway/2`.
- **One instance per session.** Each session has its own WebAssembly instance. `end()` zeroes its
  whole memory and drops it, which also reaches the copies of keys `snow` leaves behind.
- **A failure is final.** After any error, a trap or a failing random source, the session is
  wiped, and every call throws `NoiseSessionError`, which never says why.
- **Randomness** comes from `crypto.randomFillSync` through the one function the instance imports.
- **Sizes:** a message is at most 65,535 bytes, so a transport payload is at most 65,519.
  A longer one ends the session before any byte is copied. The gateway keeps the smaller handshake
  limit itself.

`src/noise.wasm` is built from the crate `apps/studio/src-tauri/crates/e2e-noise-wasm`; CI builds
it again and compares the bytes.
