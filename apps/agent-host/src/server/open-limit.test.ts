import { describe, expect, it } from "vitest";
import { OpenLimit } from "./open-limit.ts";

describe("OpenLimit", () => {
  it("counts the open things and the places still reserved", () => {
    let open = 1;
    const limit = new OpenLimit(3, () => open);
    const first = limit.reserve();
    expect(limit.reserve()).toBeDefined();
    expect(limit.reserve()).toBeUndefined();

    first?.();
    open += 1;
    expect(limit.reserve()).toBeUndefined();
    open -= 2;
    expect(limit.reserve()).toBeDefined();
  });

  it("frees one place only when a release is called twice", () => {
    const limit = new OpenLimit(2, () => 0);
    const release = limit.reserve();
    expect(limit.reserve()).toBeDefined();
    release?.();
    release?.();
    expect(limit.reserve()).toBeDefined();
    expect(limit.reserve()).toBeUndefined();
  });
});
