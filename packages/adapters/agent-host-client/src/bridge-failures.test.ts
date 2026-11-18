import type { BridgeEvent, BridgeRecorder } from "@halonicjs/ports";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { answersSent, hostAnswering, opened, openOn, services } from "./bridges.test-helper.ts";
import type { FakeHost } from "./fake-host.test-helper.ts";

/** Waits until `host` has had `count` answers, and returns them. */
async function answers(host: FakeHost, count: number): Promise<unknown[]> {
  await waitUntil("the host to have the answers", () => answersSent(host).length === count);
  return answersSent(host);
}

/** A bridge opened on a fake host, whose recorder keeps what it records. */
async function openRecording() {
  const host = hostAnswering();
  const recorded: BridgeEvent[] = [];
  const events: BridgeRecorder = { record: async (event) => void recorded.push(event) };
  const { stream } = await openOn(host, services(), events);
  return { host, stream, recorded };
}

verifies("agent-host-client.bridge-failures", () => {
  it("records a failure the host reports through the recorder as bridge.failed", async () => {
    const { host, stream, recorded } = await openRecording();
    const failure = {
      type: "bridge.failed",
      agent: "writer",
      kind: "internal",
      message: "bad reply header",
    };

    stream.send({ type: "call", call: "1", method: "recorder.record", params: failure });

    expect(await answers(host, 1)).toEqual([{ bridge: "b1", call: "1", result: null }]);
    expect(recorded).toEqual([failure]);
  });

  it("writes the bridge's token in a failure's message as [run token]", async () => {
    const { host, stream, recorded } = await openRecording();

    stream.send({
      type: "call",
      call: "1",
      method: "recorder.record",
      params: {
        type: "bridge.failed",
        agent: "writer",
        kind: "internal",
        message: `bad reply header ${opened.token}, sent with ${opened.token}`,
      },
    });

    await answers(host, 1);
    expect(recorded).toEqual([
      {
        type: "bridge.failed",
        agent: "writer",
        kind: "internal",
        message: "bad reply header [run token], sent with [run token]",
      },
    ]);
    expect(JSON.stringify(recorded)).not.toContain(opened.token);
  });

  it("refuses a failure with a field it doesn't have, or without its message", async () => {
    const { host, stream, recorded } = await openRecording();
    const failure = { type: "bridge.failed", agent: "writer", kind: "internal" };

    stream.send({
      type: "call",
      call: "1",
      method: "recorder.record",
      params: { ...failure, message: "m", cost: 1 },
    });
    stream.send({ type: "call", call: "2", method: "recorder.record", params: failure });

    const error = "The bridge called recorder.record with arguments of the wrong shape.";
    const sent = await answers(host, 2);
    expect(sent).toContainEqual({ bridge: "b1", call: "1", error });
    expect(sent).toContainEqual({ bridge: "b1", call: "2", error });
    expect(recorded).toEqual([]);
  });

  it("works as before with a host that never reports a failure", async () => {
    const { host, stream, recorded } = await openRecording();
    const request = { type: "llm.request", provider: "anthropic", model: "claude-sonnet-5-5" };

    stream.send({ type: "call", call: "1", method: "recorder.record", params: request });

    expect(await answers(host, 1)).toEqual([{ bridge: "b1", call: "1", result: null }]);
    expect(recorded).toEqual([request]);
  });
});
