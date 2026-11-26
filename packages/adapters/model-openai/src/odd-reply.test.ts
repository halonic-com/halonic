import { isModelCallError } from "@halonicjs/ports";
import { chatRequest } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { OpenAiCompatibleProvider } from "./openai-provider.ts";

/**
 * A reply `new Response()` itself refuses to build, but Node's `fetch` passes
 * on: a status outside 200–599 or a status text outside Latin-1 or with a
 * control character, as a proxy in front of the API might send.
 */
function oddReply(status: number, statusText: string): Response {
  return Object.defineProperties(new Response('{"error":{"message":"Overloaded"}}'), {
    status: { value: status },
    statusText: { value: statusText },
    ok: { value: false },
  });
}

/** What `chat` fails with when the server answers `reply`. */
function failureFor(reply: Response): Promise<unknown> {
  const provider = new OpenAiCompatibleProvider({
    id: "acme",
    type: "openai-compatible",
    baseUrl: "http://acme.test/v1",
    http: { fetch: () => Promise.resolve(reply) },
  });
  return provider.chat(chatRequest()).catch((thrown: unknown) => thrown);
}

verifies("model-openai.call-errors", () => {
  it("maps a status above 599 like any other 5xx", async () => {
    const error = await failureFor(oddReply(600, "Busy"));

    expect(isModelCallError(error) && error.reason).toBe("provider-busy");
    expect((error as Error).message).toMatch(/\(HTTP 600\)$/);
  });

  it("maps a status whose status text a Response can't hold", async () => {
    for (const statusText of ["Busy €", "Busy\u0001"]) {
      const error = await failureFor(oddReply(503, statusText));

      expect(isModelCallError(error) && error.reason).toBe("provider-busy");
      expect((error as Error).message).toMatch(/\(HTTP 503\)$/);
    }
  });
});
