import { randomUUID } from "node:crypto";
import type { HarnessBridgeServer, OpenHarnessBridge, Secrets } from "@halonicjs/ports";
import { CallChannel } from "../server/call-channel.ts";
import { type HostRoute, sendError, sendJson } from "../server/host-server.ts";
import { readCheckedBody } from "../server/json-body.ts";
import { type NdjsonStream, startNdjsonStream } from "../server/ndjson-stream.ts";
import { answerBody, bridgeBody, openBridgeBody, priceIn } from "./bridge-schemas.ts";
import { studioSecrets, studioServices } from "./studio-services.ts";

/** Makes the bridge server of one run, which reads its provider keys from `secrets`. */
export type BridgeServerFactory = (secrets: Secrets) => HarnessBridgeServer;

const unknownBridgeMessage = "The agent host has no open bridge with this id.";

interface OpenBridge {
  bridge: OpenHarnessBridge;
  channel: CallChannel;
  stream: NdjsonStream;
}

/**
 * The bridges the host has open, by an id it made. A bridge lives as long as
 * the stream Studio opened it with: closing it ends the stream, and the
 * stream ending (Studio went away) closes it.
 */
export class BridgeTable {
  private readonly bridges = new Map<string, OpenBridge>();
  private readonly closing = new Map<string, Promise<void>>();

  add(open: OpenBridge): string {
    const id = randomUUID();
    this.bridges.set(id, open);
    return id;
  }

  get(id: string): OpenBridge | undefined {
    return this.bridges.get(id);
  }

  /**
   * Closes the bridge and forgets it. The bridge closes first, while its last
   * events can still reach Studio; then its waiting calls fail and the stream ends.
   *
   * @returns false when there is no bridge with this id
   */
  async close(id: string): Promise<boolean> {
    const open = this.bridges.get(id);
    if (open === undefined) return false;
    let closing = this.closing.get(id);
    if (closing === undefined) {
      closing = this.closeOpen(id, open);
      this.closing.set(id, closing);
    }
    await closing;
    return true;
  }

  /** Keeps the bridge findable while it closes, so Studio can still answer its last calls. */
  private async closeOpen(id: string, open: OpenBridge): Promise<void> {
    try {
      await open.bridge.close();
    } finally {
      open.channel.close();
      open.stream.end();
      this.bridges.delete(id);
      this.closing.delete(id);
    }
  }

  /** Closes every bridge, when the host stops. One that fails to close doesn't stop the others. */
  async closeAll(): Promise<void> {
    await Promise.allSettled([...this.bridges.keys()].map((id) => this.close(id)));
  }
}

/**
 * The `HarnessBridgeServer` port over loopback. The bridge runs here, next to
 * the sandbox whose program calls it; the engine's recorder, tools, approvals
 * and provider keys stay in Studio, and the bridge reaches them through a
 * {@link CallChannel}:
 *
 * - `POST /v1/bridge/open` with `{ runId, agentId, providers, prices }`
 *   answers with an NDJSON stream. Its first line is
 *   `{ type: "opened", bridge, url, token }` (or `{ type: "failed", message }`),
 *   then come the channel's `call` and `cancel` lines, until the bridge closes.
 * - `POST /v1/bridge/answer` with `{ bridge, call, result }` or
 *   `{ bridge, call, error }` answers one call.
 * - `POST /v1/bridge/close` with `{ bridge }` closes the bridge and ends its stream.
 */
export function bridgeRoutes(serverFor: BridgeServerFactory, bridges: BridgeTable): HostRoute[] {
  return [
    { method: "POST", path: "/v1/bridge/open", handle: openBridgeHandler(serverFor, bridges) },
    {
      method: "POST",
      path: "/v1/bridge/answer",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, answerBody);
        if (body === undefined) return;
        const open = bridges.get(body.bridge);
        if (open === undefined) {
          sendError(response, 404, "unknown_bridge", unknownBridgeMessage);
        } else if (open.channel.answer(body.call, body)) {
          sendJson(response, 200, { answered: true });
        } else {
          sendError(response, 404, "unknown_call", "The bridge isn't waiting for this call.");
        }
      },
    },
    {
      method: "POST",
      path: "/v1/bridge/close",
      handle: async (request, response) => {
        const body = await readCheckedBody(request, response, bridgeBody);
        if (body === undefined) return;
        if (await bridges.close(body.bridge)) sendJson(response, 200, { closed: true });
        else sendError(response, 404, "unknown_bridge", unknownBridgeMessage);
      },
    },
  ];
}

/** Opens a bridge and keeps its stream open, carrying the bridge's calls, until it closes. */
function openBridgeHandler(
  serverFor: BridgeServerFactory,
  bridges: BridgeTable,
): HostRoute["handle"] {
  return async (request, response) => {
    const body = await readCheckedBody(request, response, openBridgeBody);
    if (body === undefined) return;
    const stream = startNdjsonStream(response);
    const channel = new CallChannel(stream);
    let bridge: OpenHarnessBridge;
    try {
      bridge = await serverFor(studioSecrets(channel, body.providers)).open({
        runId: body.runId,
        agentId: body.agentId,
        providers: body.providers,
        price: (provider, model) => priceIn(body.prices, provider, model),
        ...studioServices(channel),
      });
    } catch (error) {
      stream.send({
        type: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
      stream.end();
      return;
    }
    const id = bridges.add({ bridge, channel, stream });
    stream.send({ type: "opened", bridge: id, url: bridge.url, token: bridge.token });
    await stream.ended;
    // Studio went away, or the bridge was closed: no call can be answered any more.
    channel.close();
    await bridges.close(id);
  };
}
