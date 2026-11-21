import type { ChatMessage } from "@halonicjs/ports";
import { ModelCallError } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { chatFailureCauseOf } from "./chat-failure.ts";
import { chatFailureOf } from "./chat-run-failure.ts";
import { ChatService, type ChatSettings } from "./chat-service.ts";
import type { FailedModel } from "./failed-model.ts";
import { runFailureOf } from "./run-failure-facts.ts";
import { ScriptedChat, textTurn } from "./testing/scripted-chat.ts";

const settings: ChatSettings = { hubId: "acme", alias: "local" };
const question: ChatMessage[] = [{ role: "user", content: "Sort this mail." }];

/** `local` at Ollama on this computer, the model Sorter's chat called. */
const atOllama: FailedModel = {
  alias: "local",
  agent: "sorter",
  workspace: "Acme",
  model: "llama3.2",
  providerId: "ollama",
  provider: { version: 1, id: "ollama", name: "Ollama", type: "ollama", local: true, options: {} },
  address: "localhost:11434",
  keyMissing: false,
};

async function endOf(error: Error) {
  const answer = await new ChatService(new ScriptedChat([error])).answer({
    settings,
    messages: question,
    tools: [],
  });
  return answer.end;
}

verifies("app.chat-failure-cause", () => {
  it("names a model that can't be reached and its host, as a run would", async () => {
    const error = new ModelCallError("offline", "Ollama didn't answer.", {
      host: "localhost:11434",
    });

    const end = await endOf(error);

    expect(end).toEqual({
      reason: "failed",
      error,
      toolsRan: false,
      cause: { reason: "model-unreachable", host: "localhost:11434" },
    });
  });

  it("gives the facts of a run that failed the same way", async () => {
    const end = await endOf(
      new ModelCallError("offline", "Ollama didn't answer.", { host: "localhost:11434" }),
    );
    if (end.reason !== "failed" || end.cause === undefined) throw new Error("no cause");

    expect(chatFailureOf(end.cause, end.error.message, atOllama)).toEqual({
      reason: "model-unreachable",
      provider: "Ollama",
      address: "localhost:11434",
      alias: "local",
      local: true,
    });
  });

  it("gives each model call failure the reason the engine gives a run", () => {
    const cases = [
      ["no-key", "key-refused"],
      ["timeout", "model-timeout"],
      ["provider-busy", "provider-busy"],
      ["refused", "error"],
    ] as const;
    for (const [reason, expected] of cases) {
      expect(chatFailureCauseOf(new ModelCallError(reason, "it failed"))).toEqual({
        reason: expected,
      });
    }
  });

  it("keeps a proxy's typed cause, so the facts are the proxy's", () => {
    const failureCause = {
      kind: "unavailable" as const,
      code: "proxy.unreachable",
      detail: { variable: "https_proxy", proxy: "http://127.0.0.1:3128" },
    };
    const cause = chatFailureCauseOf(
      new ModelCallError("offline", "The proxy didn't answer.", { failureCause }),
    );

    expect(cause).toEqual({ reason: "model-unreachable", cause: failureCause });
    expect(chatFailureOf(cause ?? { reason: "error" }, "", atOllama)).toMatchObject({
      reason: "proxy-failed",
      problem: "unreachable",
    });
  });

  it("gives no cause for a plain error, so the chat keeps its own words", async () => {
    const error = new Error("socket hang up");

    expect(await endOf(error)).toEqual({ reason: "failed", error, toolsRan: false });
    expect(chatFailureCauseOf("not an error")).toBeUndefined();
  });

  it("gives no cause when the listener throws", async () => {
    const error = new Error("the transcript is closed");
    const answer = await new ChatService(new ScriptedChat([textTurn("Done.")])).answer({
      settings,
      messages: question,
      tools: [],
      listener: {
        onTurn: () => {
          throw error;
        },
      },
    });

    expect(answer.end).toEqual({ reason: "failed", error, toolsRan: false });
  });

  it("gives a monthly budget stop without the time it stopped as the engine's words", () => {
    const error = "Workflow failed: Monthly budget reached: 0.60 of 0.50 USD spent this month.";

    expect(runFailureOf({ reason: "budget", error }, undefined)).toEqual({
      reason: "error",
      message: error,
    });
  });
});
