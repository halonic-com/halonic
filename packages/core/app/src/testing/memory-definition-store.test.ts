import type { Digest } from "@halonicjs/ports";
import { definitionStoreContract } from "@halonicjs/testing-contracts";
import { TestDefinitionStore } from "./memory-definition-store.ts";

const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

// The kernel's fake store keeps the port's rules, so a kernel test can't
// pass on it and fail on a real store.
definitionStoreContract(
  "kernel test fake",
  async (files) => new TestDefinitionStore(files, digest),
);
