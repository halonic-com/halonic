import { tokenStoreContract } from "@halonicjs/testing-contracts";
import { memoryTokens } from "./memory-tokens.test-helper.ts";

// The test helper copies the port's name rule; the contract keeps it from drifting.
tokenStoreContract("google-setup memoryTokens", async () => memoryTokens());
