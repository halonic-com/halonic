import { describe, expect, it } from "vitest";
import * as api from "./index.ts";

describe("the package entry", () => {
  it("has no placeholder export", () => {
    expect(api).not.toHaveProperty("packageName");
  });
});
