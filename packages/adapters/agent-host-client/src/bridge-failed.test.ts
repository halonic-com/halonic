import { errorKindOf } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { agent, hostAnswering, recorder, services } from "./bridges.test-helper.ts";
import { AgentHostBridges } from "./bridges.ts";

const socketPathTooLong = {
  code: "harness-bridge.socket-path-too-long",
  detail: { bytes: "120", limit: "104", system: "macOS" },
};

/** Opens a bridge on a fake host whose first line is `line`, and gives the error and the stream. */
async function failedWith(line: unknown): Promise<{ error: unknown; hungUp: boolean }> {
  const host = hostAnswering();
  const bridges = new AgentHostBridges(host, { servicesFor: () => services() });
  const streamOpened = host.nextStream("POST /v1/bridge/open");
  const opening = bridges.open(agent, recorder);
  const stream = await streamOpened;
  stream.send(line);
  const error = await opening.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  return { error, hungUp: stream.signal.aborted };
}

verifies("agent-host-client.bridge-failure-cause", () => {
  describe("a bridge that failed to open in the host", () => {
    it("throws with the host's kind and cause, where the engine reads them", async () => {
      const { error, hungUp } = await failedWith({
        type: "failed",
        message: "The path is too long.",
        kind: "invalid_input",
        failureCause: socketPathTooLong,
      });
      expect(error).toMatchObject({
        status: 200,
        kind: "invalid_input",
        message: "The path is too long.",
        failureCause: socketPathTooLong,
      });
      expect(errorKindOf(error)).toBe("invalid_input");
      expect(hungUp).toBe(true);
    });

    it("throws bridge_failed with no cause when the host sends only a message", async () => {
      const { error } = await failedWith({ type: "failed", message: "No port free." });
      expect(error).toMatchObject({ kind: "bridge_failed", message: "No port free." });
      expect(error).not.toHaveProperty("failureCause");
    });

    it("keeps bridge_failed for a kind that isn't an error kind, and still the cause", async () => {
      const { error } = await failedWith({
        type: "failed",
        message: "x",
        kind: "socket_trouble",
        failureCause: { code: "harness-bridge.x" },
      });
      expect(error).toMatchObject({
        kind: "bridge_failed",
        failureCause: { code: "harness-bridge.x" },
      });
    });

    it.each([
      ["a code over 64 characters", { code: "a".repeat(65) }],
      ["a detail value over 300 characters", { detail: { path: "p".repeat(301) } }],
      ["a detail value that isn't a string", { detail: { bytes: 120 } }],
      ["more than 8 detail entries", { detail: Object.fromEntries(nineEntries()) }],
      ["a field it doesn't know", { code: "x.y", path: "/srv/acme" }],
    ])("takes a cause with %s as a line of the wrong shape", async (_name, failureCause) => {
      const { error, hungUp } = await failedWith({
        type: "failed",
        message: "x",
        kind: "invalid_input",
        failureCause,
      });
      expect(error).toMatchObject({ kind: "answer_invalid" });
      expect(hungUp).toBe(true);
    });
  });
});

function nineEntries(): [string, string][] {
  return Array.from({ length: 9 }, (_, index) => [`entry${index}`, String(index)]);
}
