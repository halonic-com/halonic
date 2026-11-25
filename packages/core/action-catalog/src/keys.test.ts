import { describe, expect, it } from "vitest";
import { shippedKeys } from "./keys.ts";

describe("shippedKeys", () => {
  it("is empty until a definition is added under src/<service>/", () => {
    expect(shippedKeys).toEqual([]);
  });
});
