import { describe, expect, it } from "vitest";
import { runExample } from "../examples/wait-on-a-fake-world.ts";

describe("the README example", () => {
  it("waits on fake time until the third message arrives", async () => {
    const result = await runExample();
    expect(result.third).toBe("acme-3");
    expect(result.delivered).toEqual(["acme-1", "acme-2", "acme-3"]);
  });
});
