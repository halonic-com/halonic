import type { Placement } from "@halonicjs/engine";
import type { BridgeEvent, BridgeRecorder } from "@halonicjs/ports";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { agent, answersSent, hostAnswering, opened, services } from "./bridges.test-helper.ts";
import { AgentHostBridges, type BridgeAgent, type BridgeServices } from "./bridges.ts";

/** An invented key, which the run log may never get. */
const key = "sk-ant-acme-not-real-2b9d";

/** Opens the agent's bridge for `runsOn`, with Studio's `served` and `scrub`, and keeps what it was told and recorded. */
async function openFor(
  runsOn: Placement,
  served: BridgeServices = services(),
  scrub?: (text: string) => string,
) {
  const host = hostAnswering();
  const told: BridgeAgent[] = [];
  const recorded: BridgeEvent[] = [];
  const recorder: BridgeRecorder = { record: async (event) => void recorded.push(event) };
  const bridges = new AgentHostBridges(host, {
    servicesFor: (asked) => {
      told.push(asked);
      return served;
    },
    ...(scrub === undefined ? {} : { scrub }),
  });
  const streamOpened = host.nextStream("POST /v1/bridge/open");
  const opening = bridges.open(agent, recorder, runsOn);
  const stream = await streamOpened;
  stream.send(opened);
  return { host, stream, told, recorded, bridge: await opening };
}

verifies("agent-host-client.bridge-provider-keys", () => {
  it("tells Studio the agent's harness and where it runs, as the engine opens its bridge", async () => {
    const inSandbox = await openFor("sandbox");
    const onThisComputer = await openFor("this-computer");

    expect(inSandbox.told).toEqual([
      expect.objectContaining({ harness: "claude-code", runsOn: "sandbox" }),
    ]);
    expect(onThisComputer.told).toEqual([expect.objectContaining({ runsOn: "this-computer" })]);
  });

  it("names the providers Studio serves with a key in the bridge's keyProviders, and none for a sign-in", async () => {
    const keyed = await openFor(
      "sandbox",
      services({
        providers: {
          anthropic: { kind: "key", secret: "anthropic-key" },
          openai: { kind: "sign-in" },
        },
      }),
    );
    const signedIn = await openFor(
      "sandbox",
      services({
        providers: { anthropic: { kind: "sign-in" }, openai: { kind: "sign-in" } },
      }),
    );

    expect(keyed.bridge.keyProviders).toEqual(["anthropic"]);
    expect(signedIn.bridge).not.toHaveProperty("keyProviders");
  });

  it("scrubs a key Studio handed the bridge out of a failure before the run log records it", async () => {
    const { host, stream, recorded } = await openFor("sandbox", services(), (text) =>
      text.replaceAll(key, "[secret removed]"),
    );

    stream.send({
      type: "call",
      call: "1",
      method: "recorder.record",
      params: {
        type: "bridge.failed",
        agent: "writer",
        kind: "internal",
        message: `upstream refused ${key} for ${opened.token}`,
      },
    });

    await waitUntil("the host to have the answer", () => answersSent(host).length === 1);
    expect(recorded).toEqual([
      expect.objectContaining({ message: "upstream refused [secret removed] for [run token]" }),
    ]);
    expect(JSON.stringify(recorded)).not.toContain(key);
  });
});
