import type { HttpClient } from "@halonicjs/ports";
import { chatRequest } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { OpenAiCompatibleProvider } from "./openai-provider.ts";

/**
 * A server that answers every call with a redirect to another origin. It
 * behaves as `fetch` does: it follows the redirect, headers and all, unless
 * the caller asked for `redirect: "error"`. It records every request it
 * receives, so a test sees whether the key reached the other origin.
 */
function redirectingServer() {
  const received: Array<{ url: string; headers: Headers }> = [];
  const http: HttpClient = {
    fetch: async (url, init = {}) => {
      received.push({ url, headers: new Headers(init.headers) });
      if (new URL(url).host !== "other.example.com") {
        if (init.redirect === "error") {
          throw new TypeError("the server redirected, and the request doesn't allow redirects");
        }
        return http.fetch("https://other.example.com/v1", init);
      }
      return Response.json({});
    },
  };
  return { http, received };
}

verifies("model-openai.endpoint", () => {
  it("never carries the key to another origin when the address redirects", async () => {
    const { http, received } = redirectingServer();
    const provider = new OpenAiCompatibleProvider({
      id: "acme",
      type: "openai-compatible",
      baseUrl: "https://llm.example.com/v1",
      http,
      key: async () => "test-key-1",
    });

    await expect(provider.chat(chatRequest())).rejects.toThrow();

    expect(received.map((call) => new URL(call.url).host)).toEqual(["llm.example.com"]);
    expect(received.some((call) => new URL(call.url).host === "other.example.com")).toBe(false);
  });
});
