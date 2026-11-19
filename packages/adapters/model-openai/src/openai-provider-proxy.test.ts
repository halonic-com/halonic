import { isModelCallError } from "@halonicjs/ports";
import { chatRequest } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { OpenAiCompatibleProvider } from "./openai-provider.ts";
import { ScriptedVendor } from "./test/scripted-vendor.ts";

/** A provider in front of a fresh scripted vendor. */
function providerWith() {
  const vendor = new ScriptedVendor();
  const provider = new OpenAiCompatibleProvider({
    id: "acme",
    type: "openai-compatible",
    baseUrl: "http://acme.test/v1",
    http: vendor,
  });
  return { vendor, provider };
}

verifies("model-openai.call-error-details", () => {
  it("passes on a proxy failure's cause and message, so the run log says it was the proxy", async () => {
    const { vendor, provider } = providerWith();
    const message = "Your proxy refused to connect to acme.test (status 403).";
    vendor.unreachableNext(
      Object.assign(new Error(message), {
        name: "ProxyError",
        kind: "denied",
        failureCause: { code: "proxy.refused", detail: { variable: "HTTPS_PROXY", status: "403" } },
      }),
    );
    const error = await provider.chat(chatRequest()).catch((thrown: unknown) => thrown);
    expect(error).toMatchObject({
      reason: "offline",
      kind: "denied",
      failureCause: { code: "proxy.refused", detail: { variable: "HTTPS_PROXY", status: "403" } },
    });
    expect(isModelCallError(error) && error.message).toMatch(/: Your proxy refused to connect/);
  });
  it("keeps a plain network error's own text out of the message", async () => {
    const { vendor, provider } = providerWith();
    vendor.unreachableNext(new TypeError("fetch failed"));
    const error = await provider.chat(chatRequest()).catch((thrown: unknown) => thrown);
    expect(isModelCallError(error) && error.message).not.toContain("fetch failed");
    expect(error).not.toHaveProperty("failureCause");
  });
});
