// A `bridge.failed` comes from the host as an ordinary `recorder.record` call
// (requirement `agent-host-client.bridge-failures`). The bridge already takes
// its run token and the keys it read out of the message; Studio checks again
// here, at the edge of the host, because the run log is kept and shown. A
// `harness.allowed`, a call the agent's `asks: in-sandbox` let through in the
// host, comes the same way and is checked the same way: its path or command
// is the program's own text (requirement `agent-host-client.bridge-allowed`).

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

const harnessAllowed = s
  .object({
    type: s.literal("harness.allowed"),
    agent: s.string(),
    tool: s.string(),
    detail: s.string(),
    rule: s.literal("asks-in-sandbox"),
  })
  .strict();

const wrongShape = "The bridge called recorder.record with arguments of the wrong shape.";

/**
 * The engine's recorder for one bridge's calls from the host: a
 * `bridge.failed` or a `harness.allowed` must have exactly its fields, and
 * loses the bridge's token from its message or detail as `[run token]`, and
 * every key value `scrub` removes. Every other event passes as it came.
 *
 * @param scrub - removes the values of the keys Studio handed the bridge; none by default
 * @throws when a `bridge.failed` isn't of that shape, or what `recorder` throws
 */
export function hostBridgeRecorder(
  recorder: BridgeRecorder,
  token: string,
  scrub: (text: string) => string = (text) => text,
): BridgeRecorder {
  return {
    record: async (event: BridgeEvent) => {
      const clean = (text: string) => scrub(text.replaceAll(token, "[run token]"));
      if (event.type === "harness.allowed") {
        const parsed = parse(harnessAllowed, event);
        if (!parsed.ok) throw new Error(wrongShape);
        return recorder.record({ ...parsed.value, detail: clean(parsed.value.detail) });
      }
      if (event.type !== "bridge.failed") return recorder.record(event);
      const parsed = parse(bridgeFailed, event);
      if (!parsed.ok) throw new Error(wrongShape);
      await recorder.record({ ...parsed.value, message: clean(parsed.value.message) });
    },
  };
}
