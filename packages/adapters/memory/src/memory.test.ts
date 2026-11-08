import {
  blobStoreContract,
  clockContract,
  definitionStoreContract,
  idGeneratorContract,
  recordStoreContract,
  runStoreContract,
  schedulerContract,
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
  MemoryScheduler,
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
for (const duplicateDeliveries of [false, true]) {
  const name = duplicateDeliveries ? "memory, delivering every timer twice" : "memory";
  schedulerContract(name, async (listener) => {
    const clock = new ManualClock();
    const scheduler = new MemoryScheduler(listener, clock, { duplicateDeliveries });
    return { scheduler, clock, settle: () => scheduler.runDue() };
  });
}
