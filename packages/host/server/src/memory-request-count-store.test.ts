import { requestCountStoreContract } from "@halonicjs/testing-contracts";
import { MemoryRequestCountStore } from "./memory-request-count-store.ts";

requestCountStoreContract(
  "MemoryRequestCountStore",
  { make: async () => new MemoryRequestCountStore() },
  { durable: false },
);
