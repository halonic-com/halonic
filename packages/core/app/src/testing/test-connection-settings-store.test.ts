import { connectionSettingsStoreContract } from "@halonicjs/testing-contracts";
import { TestConnectionSettingsStore } from "./test-connection-settings-store.ts";

// The kernel's fake store keeps the port's rules, so a kernel test can't
// pass on it and fail on a real store.
connectionSettingsStoreContract("kernel test fake", async () => {
  const store = new TestConnectionSettingsStore();
  return { store, damage: async (key) => store.breakSettings(key) };
});
