import type { ProviderConfig, ProviderFactoryContext } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { mockFactory } from "./mock-factory.ts";

/** A factory context whose parts fail the test if the mock ever uses them. */
const noOutsideWorld: ProviderFactoryContext = {
  secrets: { get: () => Promise.reject(new Error("the mock model read a secret")) },
  http: { fetch: () => Promise.reject(new Error("the mock model used the network")) },
};

/** A `type: mock` provider with these options. */
function provider(options: Record<string, unknown>): ProviderConfig {
  return { id: "mock", type: "mock", local: true, options };
}

verifies("model-mock.provider-factory", () => {
  it("makes a mock model from options.script", async () => {
    expect(mockFactory.type).toBe("mock");
    const model = mockFactory.create(provider({ script: { writer: ["Hello"] } }), noOutsideWorld);
    expect(model).toMatchObject({ id: "mock", type: "mock" });
    const answer = await model.chat({ model: "any", messages: [], meta: { agentId: "writer" } });
    expect(answer.content).toBe("Hello");
  });

  it("echoes when there is no script", async () => {
    const model = mockFactory.create(provider({}), noOutsideWorld);
    const answer = await model.chat({ model: "any", messages: [{ role: "user", content: "Hi" }] });
    expect(answer.content).toBe("Hi");
  });

  it("refuses a script that isn't a map", () => {
    expect(() => mockFactory.create(provider({ script: ["Hello"] }), noOutsideWorld)).toThrow(
      'Provider "mock": options.script must map agent ids to lists of replies.',
    );
  });

  it("refuses replies that aren't a list of text", () => {
    expect(() =>
      mockFactory.create(provider({ script: { writer: "Hello" } }), noOutsideWorld),
    ).toThrow('Provider "mock": options.script.writer must be a list of replies (text).');
    expect(() => mockFactory.create(provider({ script: { writer: [1] } }), noOutsideWorld)).toThrow(
      "options.script.writer",
    );
  });
});
