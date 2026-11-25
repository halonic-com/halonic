import { type GatewayHostMessage, gatewayProtocolVersion } from "@halonicjs/ports";
import { FakeSource } from "./fake-source.test-helper.ts";
import { GatewayConnection } from "./gateway-connection.ts";
import type { GatewayMessaging } from "./messaging-dispatch.ts";

const encoder = new TextEncoder();

/** A connection on a fake source and a fake transport that records what it is sent. */
export function openConnection(
  options: { allowRisky?: boolean; messaging?: GatewayMessaging } = {},
) {
  const source = new FakeSource();
  const sent: GatewayHostMessage[] = [];
  const transport = { closed: false, buffered: 0, failSends: false };
  /** The person's risky switch on the desktop, which a test may flip. */
  const risky = { allowed: options.allowRisky === true };
  const connection = new GatewayConnection({
    source,
    policy: { allowRiskyRemotely: () => risky.allowed },
    ...(options.messaging === undefined ? {} : { messaging: options.messaging }),
    transport: {
      send: (json) => {
        if (transport.failSends) throw new Error("socket gone");
        sent.push(JSON.parse(json) as GatewayHostMessage);
      },
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
    risky,
    connection,
    /** Sends a message as a text frame and waits until it is handled. */
    async say(message: unknown): Promise<void> {
      connection.receive({ binary: false, bytes: encoder.encode(JSON.stringify(message)) });
      await settle();
    },
    async hello(): Promise<void> {
      await this.say({ type: "hello", id: "h1", version: gatewayProtocolVersion });
    },
  };
}

/** Lets queued microtasks and the connection's chain run. */
export async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn++) await Promise.resolve();
}
