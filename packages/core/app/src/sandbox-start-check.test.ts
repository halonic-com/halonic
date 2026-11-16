import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { sandboxStartCheck } from "./sandbox-start-check.ts";

verifies("app.sandbox-start-check", () => {
  it("answers ok when the raw check is ok", async () => {
    const check = sandboxStartCheck(async () => ({ ok: true, reason: null, missing: [] }));
    expect(await check.check()).toEqual({ ok: true });
  });

  it("answers the reason code when the raw check fails", async () => {
    const check = sandboxStartCheck(async () => ({ ok: false, reason: "bubblewrap-missing" }));
    expect(await check.check()).toEqual({ ok: false, reason: "bubblewrap-missing" });
  });

  it("never lets the check's own sentence through for other", async () => {
    const check = sandboxStartCheck(async () => ({
      ok: false,
      reason: "other",
      missing: ["Cannot open the acme secret file: denied"],
      fix: { kind: "install" },
    }));
    const answer = await check.check();
    expect(answer).toEqual({ ok: false, reason: "other" });
    expect(JSON.stringify(answer)).not.toContain("acme");
  });

  it("reads a code from a newer version, or none, as other", async () => {
    expect(
      await sandboxStartCheck(async () => ({ ok: false, reason: "from-the-future" })).check(),
    ).toEqual({ ok: false, reason: "other" });
    expect(await sandboxStartCheck(async () => ({ ok: false })).check()).toEqual({
      ok: false,
      reason: "other",
    });
    expect(await sandboxStartCheck(async () => ({ ok: false, reason: null })).check()).toEqual({
      ok: false,
      reason: "other",
    });
  });

  it("rejects when the raw check throws", async () => {
    const check = sandboxStartCheck(async () => {
      throw new Error("host went away");
    });
    await expect(check.check()).rejects.toThrow("host went away");
  });
});
