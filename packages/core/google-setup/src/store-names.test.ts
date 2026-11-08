import { fixedClock, randomIds } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { clientSecretReader } from "./client-secret-reader.ts";
import { clientSecretStore } from "./client-secret-store.ts";
import { memoryTokens } from "./memory-tokens.test-helper.ts";
import {
  accountRefPrefix,
  clientRefPrefix,
  clientSecretName,
  refreshTokenName,
  stagedClientSecretName,
} from "./store-names.ts";
import { testIds } from "./test-ids.test-helper.ts";

const clientRef = "gclient_mfx3k2a1_a1b2c3d4";
const accountRef = "gaccount_mfx3k2a1_a1b2c3d4";

verifies("google-setup.store-names", () => {
  it("names the client secret, its staged copy and the refresh token from refs", () => {
    expect(clientSecretName(clientRef)).toBe("google-client-gclient_mfx3k2a1_a1b2c3d4");
    expect(stagedClientSecretName(clientRef)).toBe(
      "google-client-gclient_mfx3k2a1_a1b2c3d4-staged",
    );
    expect(refreshTokenName(accountRef)).toBe("google-account-gaccount_mfx3k2a1_a1b2c3d4");
  });

  it("accepts the refs that randomIds makes", () => {
    const bytes = (count: number) => new Uint8Array(count).fill(0xab);
    // The latest time a Date can hold, so the time part has the most digits.
    const ids = randomIds(bytes, fixedClock(8.64e15, 0));
    expect(() => clientSecretName(ids.next(clientRefPrefix))).not.toThrow();
    expect(() => refreshTokenName(ids.next(accountRefPrefix))).not.toThrow();
  });

  it("refuses any ref that is not in the randomIds shape", () => {
    const badClientRefs = [
      "",
      "gclient_1", // a fixedIds ref
      "Gclient_mfx3k2a1_a1b2c3d4", // case: the store would treat it as gclient_…
      "gclient-mfx3k2a1-a1b2c3d4", // "-": the store would treat it as gclient_…
      "gclient_mfx3k2a1_A1B2C3D4",
      "gclient_mfx3k2a1_a1b2c3d4_staged", // its secret would be another ref's staged copy
      "gclient_mfx3k2a1_a1b2c3d", // 7 hex digits
      "gclient_mfx3k2a1_a1b2c3g4", // not hex
      "gclient__a1b2c3d4", // no time
      "gclient_mfx3k2a1xyzw_a1b2c3d4", // a time no Date can have
      "gclient_mfx3k2a1_a1b2c3d4\n",
      "user@example.com",
      accountRef, // another kind of ref
    ];
    for (const ref of badClientRefs) {
      expect(() => clientSecretName(ref), ref).toThrow(RangeError);
      expect(() => stagedClientSecretName(ref), ref).toThrow(RangeError);
    }
    for (const ref of ["gaccount_1", "user@example.com", clientRef]) {
      expect(() => refreshTokenName(ref), ref).toThrow(RangeError);
    }
  });

  it("refuses a bad ref before the store reads or writes anything", async () => {
    const tokens = memoryTokens();
    const secrets = clientSecretStore(tokens, testIds());
    const reader = clientSecretReader(tokens);
    await expect(reader.readClientSecret(`${clientRef}_staged`)).rejects.toBeInstanceOf(RangeError);
    await expect(secrets.discard("Gclient_mfx3k2a1_a1b2c3d4")).rejects.toBeInstanceOf(RangeError);
    expect(tokens.values.size).toBe(0);
  });
});
