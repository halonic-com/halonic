import { fixedIds } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { clientSecretStore } from "./client-secret-store.ts";
import { memoryTokens } from "./memory-tokens.test-helper.ts";
import { clientSecretName, refreshTokenName, stagedClientSecretName } from "./store-names.ts";

verifies("google-setup.store-names", () => {
  it("names the client secret, its staged copy and the refresh token from refs", () => {
    expect(clientSecretName("gclient_mfx3k2a1_a1b2c3d4")).toBe(
      "google-client-gclient_mfx3k2a1_a1b2c3d4",
    );
    expect(stagedClientSecretName("gclient_1")).toBe("google-client-gclient_1-staged");
    expect(refreshTokenName("gaccount_1")).toBe("google-account-gaccount_1");
  });

  it("refuses refs that could land on another token's name", () => {
    const bad = [
      "",
      "Gclient_1", // case: the store would treat it as gclient_1
      "gclient-1", // "-": the store would treat it as gclient_1
      "gclient_1_staged", // its secret would be gclient_1's staged copy
      "user@example.com",
      "1gclient",
      "gclient__1",
      `g${"a".repeat(107)}`,
    ];
    for (const ref of bad) {
      expect(() => clientSecretName(ref), ref).toThrow(RangeError);
      expect(() => stagedClientSecretName(ref), ref).toThrow(RangeError);
      expect(() => refreshTokenName(ref), ref).toThrow(RangeError);
    }
  });

  it("never repeats the refused ref in its error message", () => {
    // A swapped call or a damaged setup record can pass a secret as the ref.
    const fakeSecret = "GOCSPX-fake"; // too short for the leak check's pattern
    for (const ref of [fakeSecret, "a".repeat(120), "gclient_1_staged"]) {
      for (const name of [clientSecretName, stagedClientSecretName, refreshTokenName]) {
        expect(rangeErrorMessage(() => name(ref))).not.toContain(ref);
      }
    }
  });

  it("fits the longest ref into the token name limit", () => {
    expect(stagedClientSecretName(`g${"a".repeat(106)}`)).toHaveLength(128);
  });

  it("refuses a bad ref before the store reads or writes anything", async () => {
    const tokens = memoryTokens();
    const secrets = clientSecretStore(tokens, fixedIds());
    await expect(secrets.readClientSecret("gclient_1_staged")).rejects.toBeInstanceOf(RangeError);
    await expect(secrets.discard("Gclient_1")).rejects.toBeInstanceOf(RangeError);
    expect(tokens.values.size).toBe(0);
  });
});

/** The message of the `RangeError` that `call` throws; fails the test when it throws none. */
function rangeErrorMessage(call: () => unknown): string {
  try {
    call();
  } catch (error) {
    if (error instanceof RangeError) {
      return error.message;
    }
  }
  throw new Error("Expected a RangeError.");
}
