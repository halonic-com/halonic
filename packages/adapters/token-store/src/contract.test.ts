import { tokenStoreContract } from "@halonicjs/testing-contracts";
import { fixedClock, memoryRecords, memorySecrets, randomTokenKey } from "./fakes.test-helper.ts";
import { tokenKeySecret } from "./token-key.ts";
import { createTokenStore } from "./token-store.ts";

tokenStoreContract("token-store", async () =>
  createTokenStore({
    records: memoryRecords(),
    secrets: memorySecrets({ [tokenKeySecret]: randomTokenKey() }),
    clock: fixedClock,
  }),
);
