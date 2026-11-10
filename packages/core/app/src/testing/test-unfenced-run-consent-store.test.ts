import { unfencedRunConsentStoreContract } from "@halonicjs/testing-contracts";
import { TestUnfencedRunConsentStore } from "./test-unfenced-run-consent-store.ts";

// The kernel's fake store keeps the port's rules, so a kernel test can't
// pass on it and fail on a real store.
unfencedRunConsentStoreContract("kernel test fake", async () => {
  const store = new TestUnfencedRunConsentStore();
  return { store, damage: async () => store.breakConsent() };
});
