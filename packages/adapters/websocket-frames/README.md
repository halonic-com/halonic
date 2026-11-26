# @halonicjs/adapter-websocket-frames

WebSocket frames (RFC 6455) read and written by our own code, with no library: the remote
gateway reads a phone's masked frames, and the Paperclip events client reads a server's
unmasked ones. A message over the size limit is refused from its header alone.

- **Layer:** adapters
- **Owner:** ravi
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-websocket-frames`

## Example

```ts
import { encodeFrame, FrameReader, frameType } from "@halonicjs/adapter-websocket-frames";

// A client reads a server's frames, at most 1 MB each, and masks what it sends.
const reader = new FrameReader(1024 * 1024, "server");
const hello = encodeFrame(frameType.text, new TextEncoder().encode("{}"), crypto.getRandomValues(new Uint8Array(4)));
for (const event of reader.push(chunk)) {
  if (event.kind === "too-large") socket.destroy();
}
```

It speaks no extensions and no fragments. Its requirement is `websocket-frames.client-frames`;
the gateway's own reading rules are `remote-gateway.websocket-frames`.
