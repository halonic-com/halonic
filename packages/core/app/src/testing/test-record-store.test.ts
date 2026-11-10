import { recordStoreContract } from "@halonicjs/testing-contracts";
import { TestRecordStore } from "./test-record-store.ts";

// The kernel's fake store keeps the port's rules, so a kernel test can't
// pass on it and fail on a real store.
recordStoreContract("kernel test fake", async () => new TestRecordStore());
