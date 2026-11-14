import { describe, expect, it } from "vitest";
import { TimeLimitError, withTimeLimit } from "./time-limit.ts";

describe("withTimeLimit", () => {
  it("settles like the work when it ends in time", async () => {
    await expect(withTimeLimit(Promise.resolve(7), 1000, "The work")).resolves.toBe(7);
    await expect(withTimeLimit(Promise.reject(new Error("no")), 1000, "The work")).rejects.toThrow(
      "no",
    );
  });

  it("rejects with a TimeLimitError that names the work and the limit", async () => {
    const never = new Promise<void>(() => {});
    const error = await withTimeLimit(never, 15, "The routine tick").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TimeLimitError);
    expect((error as Error).message).toBe("The routine tick took longer than 15 ms.");
  });
});
