// A `bridge.failed` comes from the host as an ordinary `recorder.record` call
// (requirement `agent-host-client.bridge-failures`). The bridge already takes
// its run token out of the message; Studio checks again here, at the edge of
// the host, because the run log is kept and shown.

import type { BridgeEvent, BridgeRecorder } from "@halonicjs/ports";
import { parse, s } from "@halonicjs/schema-kit";

const bridgeFailed = s
  .object({
    type: s.literal("bridge.failed"),
    agent: s.string(),
    kind: s.string(),
    message: s.string(),
  })
  .strict();

/**
 * The engine's recorder for one bridge's calls from the host: a
 * `bridge.failed` must have exactly its fields, and loses the bridge's token
 * from its message as `[run token]`. Every other event passes as it came.
 *
 * @throws when a `bridge.failed` isn't of that shape, or what `recorder` throws
 */
export function hostBridgeRecorder(recorder: BridgeRecorder, token: string): BridgeRecorder {
  return {
    record: async (event: BridgeEvent) => {
      if (event.type !== "bridge.failed") return recorder.record(event);
      const parsed = parse(bridgeFailed, event);
      if (!parsed.ok) {
        throw new Error("The bridge called recorder.record with arguments of the wrong shape.");
      }
      const failure = parsed.value;
      await recorder.record({
        ...failure,
        message: failure.message.replaceAll(token, "[run token]"),
      });
    },
  };
}
