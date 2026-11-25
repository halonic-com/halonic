import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { MemoryUsageStorage } from "./test/memory-usage-storage.ts";
import { maxSealedLength, maxUserSecrets, UserSecretShelf } from "./user-secret-shelf.ts";

function openShelf() {
  const storage = new MemoryUsageStorage();
  return { storage, shelf: new UserSecretShelf(storage) };
}

verifies("cloudflare-durable.user-secrets", () => {
  describe("UserSecretShelf", () => {
    it("keeps sealed secrets by name, lists only names, and removes them", () => {
      const { shelf } = openShelf();
      shelf.put("GITHUB_TOKEN", "us1.1.sealed-github");
      shelf.put("API_KEY", "us1.1.sealed-api");
      expect(shelf.get("GITHUB_TOKEN")).toBe("us1.1.sealed-github");
      expect(shelf.names()).toEqual(["API_KEY", "GITHUB_TOKEN"]);
      shelf.put("GITHUB_TOKEN", "us1.1.sealed-again");
      expect(shelf.get("GITHUB_TOKEN")).toBe("us1.1.sealed-again");
      shelf.remove("GITHUB_TOKEN");
      shelf.remove("GITHUB_TOKEN");
      expect(shelf.get("GITHUB_TOKEN")).toBeNull();
      expect(shelf.names()).toEqual(["API_KEY"]);
    });

    it("keeps the first data key and hands it back to a second first write", () => {
      const { shelf } = openShelf();
      expect(shelf.dataKey()).toBeNull();
      expect(shelf.keepDataKey("uk1.first")).toBe("uk1.first");
      expect(shelf.keepDataKey("uk1.second")).toBe("uk1.first");
      expect(shelf.dataKey()).toBe("uk1.first");
    });

    it("takes names only in key form", () => {
      const { shelf } = openShelf();
      for (const name of ["github-token", "github_token", "", "_TOKEN", "A".repeat(129)]) {
        expect(() => shelf.put(name, "us1.1.sealed")).toThrow(RangeError);
        expect(() => shelf.get(name)).toThrow(RangeError);
        expect(() => shelf.remove(name)).toThrow(RangeError);
      }
    });

    it("refuses an empty or oversized sealed value and stores nothing", () => {
      const { shelf } = openShelf();
      expect(() => shelf.put("TOKEN", "")).toThrow(RangeError);
      expect(() => shelf.put("TOKEN", "x".repeat(maxSealedLength + 1))).toThrow(RangeError);
      expect(() => shelf.keepDataKey("")).toThrow(RangeError);
      expect(shelf.names()).toEqual([]);
      expect(shelf.dataKey()).toBeNull();
    });

    it(`refuses a new name past ${maxUserSecrets} secrets, but replaces a kept one`, () => {
      const { shelf } = openShelf();
      for (let index = 0; index < maxUserSecrets; index += 1) {
        shelf.put(`TOKEN_${index}`, "us1.1.sealed");
      }
      expect(() => shelf.put("ONE_MORE", "us1.1.sealed")).toThrow(/at most 100 secrets/);
      shelf.put("TOKEN_0", "us1.1.replaced");
      expect(shelf.get("TOKEN_0")).toBe("us1.1.replaced");
      expect(shelf.names()).toHaveLength(maxUserSecrets);
    });
  });
});
