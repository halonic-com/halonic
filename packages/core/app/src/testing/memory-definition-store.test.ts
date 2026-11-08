import { definitionStoreContract } from "@halonicjs/testing-contracts";
import { TestDefinitionStore } from "./memory-definition-store.ts";

// The kernel's fake store keeps the port's rules, so a kernel test can't
// pass on it and fail on a real store.
definitionStoreContract("kernel test fake", async (files) => new TestDefinitionStore(files));
