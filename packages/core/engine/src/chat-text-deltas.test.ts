import { type ChatTurnText, ModelCallError } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { reviewedTools } from "./agent/listed-tool-approval.test-helper.ts";
import type { ResolvedModel } from "./agent/model-chain.ts";
import { StreamingModel, streamed } from "./agent/streaming-model.test-helper.ts";
import { halonicTool, secretsWith, steppingClock } from "./agent/turn-test-kit.test-helper.ts";
import { LocalExecutor } from "./local-executor.ts";
import { call, callAnswer, ScriptedModel, textAnswer } from "./testing/scripted-model.ts";

const offline = () => new ModelCallError("offline", "acme-cloud can't be reached");

/** Runs one chat turn on `model` and keeps what `onText` heard. */
async function chatOn(model: ResolvedModel) {
  const lookup = halonicTool("lookup", async () => "INV-7");
  const executor = new LocalExecutor({
    resolveModel: async () => model,
    halonicTools: [lookup],
    connectors: [],
    listedToolApproval: reviewedTools,
    secrets: secretsWith(),
    clock: steppingClock(),
  });
  const heard: ChatTurnText[] = [];
  const response = await executor.chatTurn({
    hubId: "acme",
    messages: [{ role: "user", content: "Find the Acme invoice" }],
    tools: [],
    onText: (text) => heard.push(text),
  });
  return { response, heard };
}

/** The text a reader shows: the deltas since the last restart. */
function shownText(heard: readonly ChatTurnText[]): string {
  let shown = "";
  for (const text of heard) {
    shown = text.kind === "restart" ? "" : shown + text.text;
  }
  return shown;
}

/** The text after each restart, so a test can check none holds text from before it. */
function textsAfterRestarts(heard: readonly ChatTurnText[]): string[] {
  return heard.flatMap((text, index) =>
    text.kind === "restart" ? [shownText(heard.slice(index))] : [],
  );
}

verifies("engine.chat-text-deltas", () => {
  it("passes the model's text on as it is written, adding up to the answer", async () => {
    const model = new StreamingModel([streamed(textAnswer("Found it"))], "acme-local");

    const { response, heard } = await chatOn({ provider: model, model: "acme-local-1" });

    expect(heard).toEqual([
      { kind: "delta", text: "Fou" },
      { kind: "delta", text: "nd it" },
    ]);
    expect(shownText(heard)).toBe(response.content);
  });

  it("restarts when a model fails part way and the next model takes over", async () => {
    const local = new StreamingModel(
      [{ pieces: streamed(textAnswer("Partial")).slice(0, 2), error: offline() }],
      "acme-local",
    );
    const cloud = new StreamingModel([streamed(textAnswer("From the cloud"))], "acme-cloud");

    const { response, heard } = await chatOn({
      alias: "local",
      provider: local,
      model: "acme-local-1",
      fallback: [{ alias: "smart", provider: cloud, model: "acme-cloud-1" }],
    });

    expect(heard.map((text) => text.kind)).toEqual(["delta", "delta", "restart", "delta", "delta"]);
    expect(shownText(heard)).toBe("From the cloud");
    expect(response.content).toBe("From the cloud");
    expect(textsAfterRestarts(heard).join("")).not.toContain("Partial");
  });

  it("restarts when the same model is tried again after failing part way", async () => {
    const model = new StreamingModel(
      [
        { pieces: streamed(textAnswer("Half an answer")).slice(0, 2), error: offline() },
        streamed(textAnswer("Whole answer")),
      ],
      "acme-local",
    );

    const { heard } = await chatOn({
      alias: "local",
      provider: model,
      model: "acme-local-1",
      fallback: [{ alias: "local-again", provider: model, model: "acme-local-1" }],
    });

    expect(model.streamed).toHaveLength(2);
    expect(heard.filter((text) => text.kind === "restart")).toHaveLength(1);
    expect(shownText(heard)).toBe("Whole answer");
    expect(textsAfterRestarts(heard).join("")).not.toContain("Half");
  });

  it("restarts when the turn runs its own tool and asks the model again", async () => {
    const model = new StreamingModel(
      [
        streamed({ ...callAnswer(call("c1", "lookup")), content: "Let me look" }),
        streamed(textAnswer("Found INV-7")),
      ],
      "acme-local",
    );

    const { response, heard } = await chatOn({ provider: model, model: "acme-local-1" });

    expect(response.content).toBe("Found INV-7");
    expect(heard.filter((text) => text.kind === "restart")).toHaveLength(1);
    expect(shownText(heard)).toBe("Found INV-7");
    expect(textsAfterRestarts(heard).join("")).not.toContain("Let me look");
  });

  it("sends no restart before the first text, and none for a round that wrote nothing", async () => {
    const model = new StreamingModel(
      [streamed(callAnswer(call("c1", "lookup"))), streamed(textAnswer("Found INV-7"))],
      "acme-local",
    );

    const { heard } = await chatOn({ provider: model, model: "acme-local-1" });

    expect(heard.map((text) => text.kind)).toEqual(["delta", "delta"]);
  });

  it("answers as before, hearing nothing, from a provider that can't stream", async () => {
    const model = new ScriptedModel([textAnswer("Found it")], "acme-local");

    const { response, heard } = await chatOn({ provider: model, model: "acme-local-1" });

    expect(response.content).toBe("Found it");
    expect(heard).toEqual([]);
  });
});
