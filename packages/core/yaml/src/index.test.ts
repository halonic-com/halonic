import { describe, expect, it } from "vitest";
import { packageName } from "./index.ts";

describe("packageName", () => {
  it("is the npm name", () => {
    expect(packageName).toBe("@halonicjs/yaml");
  });
});
