import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { WorkspaceProviderCheck } from "./workspace-provider-check.ts";

/** A client that records what it was asked and answers with `answer`. */
function client(answer: () => Promise<Response>) {
  const asked: string[] = [];
  return {
    asked,
    fetch: (url: string) => {
      asked.push(url);
      return answer();
    },
  };
}

verifies("models.providers.check", () => {
  it("names the address of a provider's base URL or its type's usual one", () => {
    const check = new WorkspaceProviderCheck(client(async () => new Response("")));

    expect(check.addressOf({ type: "ollama" })).toBe("localhost:11434");
    expect(check.addressOf({ type: "lmstudio" })).toBe("localhost:1234");
    expect(
      check.addressOf({ type: "openai-compatible", baseUrl: "http://nas.local:8080/v1" }),
    ).toBe("nas.local:8080");
    expect(check.addressOf({ type: "openai-compatible" })).toBeUndefined();
  });

  it("asks the model list and says answering for a success status", async () => {
    const http = client(async () => new Response("{}"));

    expect(await new WorkspaceProviderCheck(http).isAnswering({ type: "ollama" })).toBe(true);
    expect(http.asked).toEqual(["http://localhost:11434/v1/models"]);
  });

  it("says not answering for an error status, a refusal and a provider with no address", async () => {
    const failing = (answer: () => Promise<Response>) =>
      new WorkspaceProviderCheck(client(answer)).isAnswering({ type: "ollama" });

    expect(await failing(async () => new Response("", { status: 503 }))).toBe(false);
    expect(await failing(() => Promise.reject(new Error("address_refused")))).toBe(false);
    expect(
      await new WorkspaceProviderCheck(client(async () => new Response(""))).isAnswering({
        type: "openai-compatible",
      }),
    ).toBe(false);
  });
});
