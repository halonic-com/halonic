import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { runCallOn as runOn } from "./harness-call-test-kit.test-helper.ts";
import { finished, harnessPorts } from "./harness-test-kit.test-helper.ts";

verifies("engine.run-harness", () => {
  it("records how the agent signs in to its harness's provider, and only that", async () => {
    const opened = async (providers?: Parameters<typeof ports.serveProviders>[0]) => {
      ports = harnessPorts();
      ports.harness.events = [finished("ok")];
      if (providers !== undefined) ports.serveProviders(providers);
      const { written } = await runOn(ports);
      const event = written.find((each) => each.type === "sandbox.opened");
      return event?.type === "sandbox.opened" ? event.sandbox : undefined;
    };
    let ports = harnessPorts();

    expect((await opened({ anthropic: { kind: "sign-in" } }))?.signIn).toEqual({
      kind: "subscription",
      provider: "anthropic",
    });
    const zai = {
      kind: "key",
      secret: "ZAI_API_KEY",
      baseUrl: "https://z.example",
      providerId: "zai",
    } as const;
    const keyed = await opened({ anthropic: zai, openai: { kind: "sign-in" } });
    expect(keyed?.signIn).toEqual({ kind: "key", provider: "zai" });
    expect(JSON.stringify(keyed)).not.toContain("ZAI_API_KEY");
    expect(JSON.stringify(keyed)).not.toContain("z.example");
    expect(
      (await opened({ anthropic: { kind: "key", secret: "ANTHROPIC_API_KEY" } }))?.signIn,
    ).toEqual({
      kind: "key",
      provider: "anthropic",
    });
    expect(await opened({ openai: { kind: "sign-in" } })).not.toHaveProperty("signIn");
    expect(await opened()).not.toHaveProperty("signIn");
  });
});
