import type { BridgeEvent, BridgeRecorder } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { LocalBridgeHost } from "./bridge-host.ts";
import { approveAll, harnessAgentOf, noTools, RecordingBridgeServer } from "./fakes.test-helper.ts";

const writer = harnessAgentOf("writer", "/data/proposals/01JD8Q");
const failure = { kind: "internal", message: "bad reply header [run token]" };

/**
 * Opens the writer's bridge on a fake server with `recorder`, and gives the
 * `reportError` the bridge got and what the host's own `reportError` heard.
 */
async function openWith(recorder: BridgeRecorder) {
  const server = new RecordingBridgeServer();
  const reported = Promise.withResolvers<unknown>();
  const host = new LocalBridgeHost({
    servers: { sandbox: server, "this-computer": server },
    services: {
      servicesFor: () => ({ providers: {}, prices: {}, tools: noTools, approvals: approveAll }),
    },
    reportError: reported.resolve,
  });
  await host.open(writer, recorder, "sandbox");
  const reportError = server.opened[0]?.reportError;
  if (reportError === undefined) throw new Error("expected the host to pass reportError");
  return { reportError, reported: reported.promise };
}

verifies("harness-host.bridge-failures", () => {
  it("writes a failure the bridge reports to the run log as bridge.failed", async () => {
    const recorded: BridgeEvent[] = [];
    const { reportError } = await openWith({
      record: async (event) => void recorded.push(event),
    });

    reportError(failure);

    expect(recorded).toEqual([
      {
        type: "bridge.failed",
        agent: "writer",
        kind: "internal",
        message: "bad reply header [run token]",
      },
    ]);
  });

  it("gives the host the failure when the run log rejects it, and doesn't throw", async () => {
    const logGone = new Error("the run log is closed");
    const { reportError, reported } = await openWith({ record: () => Promise.reject(logGone) });

    expect(() => reportError(failure)).not.toThrow();

    const error = await reported;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      "The run log couldn't record a failure of the harness bridge (internal): bad reply header [run token]",
    );
    expect((error as Error).cause).toBe(logGone);
  });

  it("gives the host the failure when the recorder throws before it returns, and doesn't throw", async () => {
    const broken = new Error("no recorder");
    const { reportError, reported } = await openWith({
      record: () => {
        throw broken;
      },
    });

    expect(() => reportError(failure)).not.toThrow();

    expect(((await reported) as Error).cause).toBe(broken);
  });
});
