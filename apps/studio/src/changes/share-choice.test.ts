import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type ChoiceStorage, shareChoiceMemory } from "./share-choice.ts";

/** Window storage as a plain map, so a second memory reads what the first wrote. */
function mapStorage(): ChoiceStorage & { readonly kept: Map<string, string> } {
  const kept = new Map<string, string>();
  return {
    kept,
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => {
      kept.set(key, value);
    },
  };
}

/** Storage that refuses everything, as a full or blocked one does. */
const refusing: ChoiceStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("full");
  },
};

verifies("source-control.create-version-share", () => {
  describe("shareChoiceMemory", () => {
    it("starts off", () => {
      expect(shareChoiceMemory(mapStorage(), "/work/acme").read()).toBe(false);
    });

    it("keeps the choice for the next window of the same workspace only", () => {
      const storage = mapStorage();
      shareChoiceMemory(storage, "/work/acme").write(true);
      expect(shareChoiceMemory(storage, "/work/acme").read()).toBe(true);
      expect(shareChoiceMemory(storage, "/work/other").read()).toBe(false);
    });

    it("keeps a choice turned off again", () => {
      const storage = mapStorage();
      shareChoiceMemory(storage, "/work/acme").write(true);
      shareChoiceMemory(storage, "/work/acme").write(false);
      expect(shareChoiceMemory(storage, "/work/acme").read()).toBe(false);
    });

    it("keeps the choice for this window when storage refuses it", () => {
      const memory = shareChoiceMemory(refusing, "/work/acme");
      expect(memory.read()).toBe(false);
      memory.write(true);
      expect(memory.read()).toBe(true);
    });
  });
});
