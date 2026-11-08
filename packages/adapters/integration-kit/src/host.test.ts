import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { fakeTransport, memoryTokens, policy, secrets } from "./fake-transport.test-helper.ts";
import { createIntegrationHost } from "./host.ts";
import { IntegrationRefusedError } from "./refused.ts";
import { storedTokenName } from "./scoped-tokens.ts";

verifies("integration-kit.scoped-tokens", () => {
  it("keeps an integration's tokens under its own names", async () => {
    const shared = memoryTokens();
    const { host } = createIntegrationHost({
      policy,
      transport: fakeTransport().transport,
      secrets,
      tokens: shared,
    });
    await host.tokens.set("refresh", "r1");
    expect(await host.tokens.get("refresh")).toBe("r1");
    expect([...shared.values.keys()]).toEqual(["i7_weather_refresh"]);
    await host.tokens.remove("refresh");
    expect(shared.values.size).toBe(0);
  });

  it("refuses a token the sheet doesn't declare", async () => {
    const { host } = createIntegrationHost({
      policy,
      transport: fakeTransport().transport,
      secrets,
      tokens: memoryTokens(),
    });
    await expect(host.tokens.get("i5_other_refresh")).rejects.toBeInstanceOf(
      IntegrationRefusedError,
    );
  });

  it("never gives two integrations the same stored name", () => {
    expect(storedTokenName("a-b", "c")).not.toBe(storedTokenName("a", "b-c"));
    expect(storedTokenName("a-b", "c").replaceAll("-", "_")).not.toBe(
      storedTokenName("a", "b-c").replaceAll("-", "_"),
    );
  });
});

verifies("integration-kit.scoped-tokens", () => {
  it("gives the integration only http, tokens, settings and wait, frozen", () => {
    const { host } = createIntegrationHost({
      policy,
      transport: fakeTransport().transport,
      secrets,
      tokens: memoryTokens(),
      settings: { city: "Ghent" },
    });
    expect(Object.keys(host).sort()).toEqual(["http", "settings", "tokens", "wait"]);
    expect(
      Object.isFrozen(host) && Object.isFrozen(host.http) && Object.isFrozen(host.settings),
    ).toBe(true);
    expect(host.settings).toEqual({ city: "Ghent" });
    expect(JSON.stringify(host)).not.toContain("canary");
  });
});
