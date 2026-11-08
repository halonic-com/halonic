import { blobStoreContract, definitionStoreContract } from "@halonicjs/testing-contracts";
import { MemoryBlobStore, MemoryDefinitionStore } from "./index.ts";

// The old memory.test.ts ran the old contracts against these adapters; this file does the same.
definitionStoreContract("memory", async (files) => new MemoryDefinitionStore(files));
blobStoreContract("memory", async () => new MemoryBlobStore());
