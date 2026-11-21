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

  it("lets the check's own sentences through for other only as details", async () => {
    const check = sandboxStartCheck(async () => ({
      ok: false,
      reason: "other",
      missing: ["No seccomp filter", "Cannot mount /proc"],
      fix: { kind: "install" },
    }));
    expect(await check.check()).toEqual({
      ok: false,
      reason: "other",
      details: "No seccomp filter\nCannot mount /proc",
    });
  });

  it("never lets the check's own sentence through for any other reason", async () => {
    const check = sandboxStartCheck(async () => ({
      ok: false,
      reason: "bubblewrap-missing",
      missing: ["Cannot open the acme secret file: denied"],
    }));
    const answer = await check.check();
    expect(answer).toEqual({ ok: false, reason: "bubblewrap-missing" });
    expect(JSON.stringify(answer)).not.toContain("acme");
  });

  it("gives other no details when the check says nothing", async () => {
    const check = sandboxStartCheck(async () => ({ ok: false, reason: "other", missing: [] }));
    expect(await check.check()).toEqual({ ok: false, reason: "other" });
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
