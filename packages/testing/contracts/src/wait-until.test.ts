import { describe, expect, it } from "vitest";
import { waitUntil } from "./wait-until.ts";

describe("waitUntil", () => {
  it("returns at once when the check already passes", async () => {
    await expect(waitUntil(() => true)).resolves.toBeUndefined();
  });

  it("keeps checking until the check passes", async () => {
    let tries = 0;
    await waitUntil(() => ++tries >= 3);
    expect(tries).toBe(3);
  });

  it("gives up with an error when the check never passes", async () => {
    await expect(waitUntil(() => false, 30)).rejects.toThrow("Timed out");
  });
});
