import {
  blobStoreContract,
  clockContract,
  definitionStoreContract,
  idGeneratorContract,
  recordStoreContract,
  runStoreContract,
  secretsContract,
  tokenStoreContract,
} from "@halonicjs/testing-contracts";
import {
  fixedIds,
  ManualClock,
  MemoryBlobStore,
  MemoryDefinitionStore,
  MemoryRecordStore,
  MemoryRunStore,
  MemorySecrets,
  MemoryTokenStore,
} from "./index.ts";

// The old memory.test.ts ran the old contracts against these adapters; this file does the same.
definitionStoreContract("memory", async (files) => new MemoryDefinitionStore(files));
runStoreContract("memory", async () => new MemoryRunStore());
blobStoreContract("memory", async () => new MemoryBlobStore());
recordStoreContract("memory", async () => new MemoryRecordStore());
secretsContract("memory", async (values) => new MemorySecrets(values));
tokenStoreContract("memory", async () => new MemoryTokenStore());
clockContract("memory", async () => new ManualClock());
idGeneratorContract("memory", async () => fixedIds());
