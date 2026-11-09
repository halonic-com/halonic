import { trustRecord } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MemoryTrustStore } from "./trust-store.ts";

verifies("memory.trust-store", () => {
  it("makes a damaged record unreadable, naming its location", async () => {
    const store = new MemoryTrustStore();
    await store.grant(trustRecord("/workspaces/acme"));
    store.damage("/workspaces/acme");
    await expect(store.get("/workspaces/acme")).rejects.toThrow(
      'The trust record for "/workspaces/acme" can\'t be read.',
    );
  });

  it("refuses to damage a location it holds no record for", async () => {
    const store = new MemoryTrustStore();
    expect(() => store.damage("/workspaces/never")).toThrow(
      'There is no trust record for "/workspaces/never" to damage.',
    );
    expect(await store.list()).toEqual([]);
  });
});
