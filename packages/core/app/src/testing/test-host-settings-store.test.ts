import { hostSettingsStoreContract } from "@halonicjs/testing-contracts";
import { TestHostSettingsStore } from "./test-host-settings-store.ts";

// The kernel's fake store keeps the port's rules, so a kernel test can't
// pass on it and fail on a real store.
hostSettingsStoreContract("kernel test fake", async () => {
  const store = new TestHostSettingsStore();
  const elsewhere = new TestHostSettingsStore(store);
  return {
    store,
    saved: async () => store.savedText(),
    brokenCopy: async () => store.brokenText(),
    writeSaved: async (text) => store.writeText(text),
    changeElsewhere: (key, value) => elsewhere.set(key, value),
  };
});
