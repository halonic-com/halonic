import { secretStoreContract } from "@halonicjs/testing-contracts";
import { TestSecretStore } from "./test-secret-store.ts";

// The kernel's fake store keeps the port's rules, so a kernel test can't
// pass on it and fail on a real store.
secretStoreContract(
  "kernel test fake",
  (() => {
    let store = new TestSecretStore();
    return {
      make: async () => {
        store = new TestSecretStore();
        return store;
      },
      reopen: async () => store,
    };
  })(),
);
