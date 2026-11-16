import type { GatewayHostMessage } from "@halonicjs/ports";
import { FakeSource } from "./fake-source.test-helper.ts";
import { GatewayConnection } from "./gateway-connection.ts";

const encoder = new TextEncoder();

/** A connection on a fake source and a fake transport that records what it is sent. */
export function openConnection(options: { allowRisky?: boolean } = {}) {
  const source = new FakeSource();
  const sent: GatewayHostMessage[] = [];
  const transport = { closed: false, buffered: 0 };
  const connection = new GatewayConnection({
    source,
    policy: { allowRiskyRemotely: () => options.allowRisky === true },
    transport: {
      send: (json) => sent.push(JSON.parse(json) as GatewayHostMessage),
      bufferedBytes: () => transport.buffered,
      close: () => {
        transport.closed = true;
      },
    },
  });
  return {
    source,
    sent,
    transport,
    connection,
    /** Sends a message as a text frame and waits until it is handled. */
    async say(message: unknown): Promise<void> {
      connection.receive({ binary: false, bytes: encoder.encode(JSON.stringify(message)) });
      await settle();
    },
    async hello(): Promise<void> {
      await this.say({ type: "hello", id: "h1", version: 1 });
    },
  };
}

/** Lets queued microtasks and the connection's chain run. */
export async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn++) await Promise.resolve();
}
