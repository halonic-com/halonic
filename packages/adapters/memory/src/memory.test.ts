import {
  blobStoreContract,
  definitionStoreContract,
  recordStoreContract,
  runStoreContract,
} from "@halonicjs/testing-contracts";
import {
  MemoryBlobStore,
  MemoryDefinitionStore,
  MemoryRecordStore,
  MemoryRunStore,
} from "./index.ts";

// The old memory.test.ts ran the old contracts against these adapters; this file does the same.
definitionStoreContract("memory", async (files) => new MemoryDefinitionStore(files));
runStoreContract("memory", async () => new MemoryRunStore());
blobStoreContract("memory", async () => new MemoryBlobStore());
recordStoreContract("memory", async () => new MemoryRecordStore());
