import { unfencedRunConsent } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MemoryUnfencedRunConsentStore } from "./unfenced-run-consent-store.ts";

verifies("memory.unfenced-run-consent-store", () => {
  it("makes a damaged yes unreadable", async () => {
    const store = new MemoryUnfencedRunConsentStore();
    await store.save(unfencedRunConsent());
    store.damage();
    await expect(store.get()).rejects.toThrow(
      "The saved yes to run plugins and integrations without the sandbox can't be read.",
    );
  });

  it("refuses to damage a yes it doesn't hold", async () => {
    const store = new MemoryUnfencedRunConsentStore();
    expect(() => store.damage()).toThrow("There is no saved yes to damage.");
    expect(await store.get()).toBeNull();
  });
});
