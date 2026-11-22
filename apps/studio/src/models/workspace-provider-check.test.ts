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

/** The workspace's trust, which never changes in these tests. */
function trustOf(isTrusted: boolean) {
  return { isTrusted: () => isTrusted, subscribe: () => () => {} };
}

const trusted = trustOf(true);
const notTrusted = trustOf(false);

verifies("models.providers.check", () => {
  it("names the address of a provider's base URL or its type's usual one", () => {
    const check = new WorkspaceProviderCheck(
      client(async () => new Response("")),
      trusted,
    );

    expect(check.addressOf({ type: "ollama" })).toBe("localhost:11434");
    expect(check.addressOf({ type: "lmstudio" })).toBe("localhost:1234");
    expect(
      check.addressOf({ type: "openai-compatible", baseUrl: "http://nas.local:8080/v1" }),
    ).toBe("nas.local:8080");
    expect(check.addressOf({ type: "openai-compatible" })).toBeUndefined();
  });

  it("asks the model list and says answering for a success status", async () => {
    const http = client(async () => new Response("{}"));

    expect(await new WorkspaceProviderCheck(http, trusted).isAnswering({ type: "ollama" })).toBe(
      true,
    );
    expect(http.asked).toEqual(["http://localhost:11434/v1/models"]);
  });

  it("says not answering for an error status, a refusal and a provider with no address", async () => {
    const failing = (answer: () => Promise<Response>) =>
      new WorkspaceProviderCheck(client(answer), trusted).isAnswering({ type: "ollama" });

    expect(await failing(async () => new Response("", { status: 503 }))).toBe(false);
    expect(await failing(() => Promise.reject(new Error("address_refused")))).toBe(false);
    expect(
      await new WorkspaceProviderCheck(
        client(async () => new Response("")),
        trusted,
      ).isAnswering({
        type: "openai-compatible",
      }),
    ).toBe(false);
  });

  it("asks only an address on this computer, without the query, until the workspace is trusted", async () => {
    const http = client(async () => new Response("{}"));
    const check = new WorkspaceProviderCheck(http, notTrusted);
    const on = (baseUrl: string) => ({ type: "openai-compatible", baseUrl });

    expect(check.addressOf(on("http://nas.local:8080/v1"))).toBeUndefined();
    expect(await check.isAnswering(on("https://models.example.com/v1?who=me"))).toBe(false);
    expect(check.addressOf({ type: "ollama" })).toBe("localhost:11434");
    expect(await check.isAnswering(on("http://localhost:11500/v1?who=me#top"))).toBe(true);
    expect(await check.isAnswering(on("http://127.0.0.2:8080/v1"))).toBe(true);
    expect(await check.isAnswering(on("http://[::1]:8080/v1"))).toBe(true);
    expect(http.asked).toEqual([
      "http://localhost:11500/v1/models",
      "http://127.0.0.2:8080/v1/models",
      "http://[::1]:8080/v1/models",
    ]);
  });

  it("says Check waits for trust only for an address off this computer, until the workspace is trusted", () => {
    const on = (baseUrl: string) => ({ type: "openai-compatible", baseUrl });
    const waiting = new WorkspaceProviderCheck(
      client(async () => new Response("")),
      notTrusted,
    );
    const open = new WorkspaceProviderCheck(
      client(async () => new Response("")),
      trusted,
    );

    expect(waiting.waitsForTrust(on("http://192.168.1.20:11434/v1"))).toBe(true);
    expect(waiting.waitsForTrust(on("http://localhost:11434/v1"))).toBe(false);
    expect(waiting.waitsForTrust({ type: "openai-compatible" })).toBe(false);
    expect(open.waitsForTrust(on("http://192.168.1.20:11434/v1"))).toBe(false);
  });

  it("tells the page when the workspace's trust changes", () => {
    const listeners: (() => void)[] = [];
    let isTrusted = false;
    const check = new WorkspaceProviderCheck(
      client(async () => new Response("")),
      {
        isTrusted: () => isTrusted,
        subscribe: (listener) => {
          listeners.push(listener);
          return () => {};
        },
      },
    );
    let changes = 0;
    check.subscribe(() => {
      changes += 1;
    });

    isTrusted = true;
    for (const listener of listeners) listener();

    expect(changes).toBe(1);
    expect(
      check.addressOf({ type: "openai-compatible", baseUrl: "http://192.168.1.20:11434/v1" }),
    ).toBe("192.168.1.20:11434");
  });
});
