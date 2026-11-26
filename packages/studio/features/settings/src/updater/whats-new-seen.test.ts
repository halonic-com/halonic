import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { type SeenStore, whatsNewDue } from "./whats-new-seen.ts";

function memoryStore(): SeenStore {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  };
}

verifies("settings.whats-new", () => {
  describe("the Updated to dialog's memory", () => {
    it("is due once per version, and again for the next one", () => {
      const store = memoryStore();
      expect(whatsNewDue("0.1.1", store)).toBe(true);
      expect(whatsNewDue("0.1.1", store)).toBe(false);
      expect(whatsNewDue("0.1.2", store)).toBe(true);
    });

    it("is due when storage is missing or refuses, and says so in the console", () => {
      expect(whatsNewDue("0.1.1", null)).toBe(true);
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const refusing: SeenStore = {
        getItem: () => null,
        setItem: () => {
          throw new Error("quota");
        },
      };
      expect(whatsNewDue("0.1.1", refusing)).toBe(true);
      expect(error).toHaveBeenCalledOnce();
      error.mockRestore();
    });
  });
});
