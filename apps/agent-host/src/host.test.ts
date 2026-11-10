import { afterEach, describe, expect, it, vi } from "vitest";
import { run } from "./host.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("run", () => {
  it("prints its version", async () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    expect(await run([], "1.2.3")).toBe(0);
    expect(write.mock.calls).toEqual([["halonic-agent-host 1.2.3\n"]]);
  });

  it("says whether the sandbox works here with --sandbox-check", async () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    expect(await run(["--sandbox-check"], "1.2.3")).toBe(0);
    const check = JSON.parse(String(write.mock.calls[1]?.[0])) as { ok: boolean };
    expect(typeof check.ok).toBe("boolean");
  });
});
