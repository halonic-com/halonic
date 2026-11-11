import type { SandboxCapabilities } from "@halonicjs/ports";
import { err, ok } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { doctorSummary } from "./doctor-checks.ts";
import { diskLine, sandboxLine, workspaceLine } from "./doctor-lines.ts";
import type { DataUsage } from "./resource-report.ts";

verifies("app.doctor-workspace", () => {
  it("is ok when this computer trusts the workspace", () => {
    expect(workspaceLine("acme", "trusted")).toEqual({
      check: "workspace",
      status: "ok",
      name: "acme",
      trust: "trusted",
    });
  });

  it("is ok when a run there can only reach the test model, so it needs no trust", () => {
    expect(workspaceLine("acme", "not-needed")).toEqual({
      check: "workspace",
      status: "ok",
      name: "acme",
      trust: "not-needed",
    });
  });

  it("warns when the workspace isn't trusted yet or changed since", () => {
    expect(workspaceLine("acme", "new").status).toBe("warning");
    expect(workspaceLine("acme", "changed")).toEqual({
      check: "workspace",
      status: "warning",
      name: "acme",
      trust: "changed",
    });
  });

  it("warns when the trust record can't be read, as for an untrusted workspace", () => {
    expect(workspaceLine("acme", "unreadable").status).toBe("warning");
  });
});

const onThisComputer: SandboxCapabilities = { files: "shared", strength: "os" };

verifies("app.doctor-sandbox", () => {
  it("is ok with the sandbox's capabilities when it can start", () => {
    expect(sandboxLine({ ok: true, reason: null, missing: [] }, onThisComputer)).toEqual({
      check: "sandbox",
      status: "ok",
      capabilities: onThisComputer,
    });
  });

  it("fails with the reason code when the sandbox can't start, so doctor exits 1", () => {
    const line = sandboxLine(
      { ok: false, reason: "bubblewrap-missing", missing: ["bubblewrap is not installed"] },
      onThisComputer,
    );

    expect(line).toEqual({
      check: "sandbox",
      status: "failed",
      reason: "bubblewrap-missing",
      missing: ["bubblewrap is not installed"],
    });
    expect(doctorSummary([line]).needsFixing).toBe(true);
  });

  it("keeps the check's own sentence apart from the code for an unknown cause", () => {
    const line = sandboxLine(
      { ok: false, reason: "other", missing: ["seccomp is unavailable"] },
      onThisComputer,
    );

    expect(line).toMatchObject({ reason: "other", missing: ["seccomp is unavailable"] });
  });
});

function folder(kind: DataUsage["kind"], size: DataUsage["size"]): DataUsage {
  return { kind, workspace: "acme", path: `/data/acme/${kind}`, size };
}

verifies("app.doctor-disk", () => {
  it("gives the free space, what Halonic's data takes and the run logs' part", () => {
    const line = diskLine({
      disk: ok({ freeBytes: 48_000_000_000, low: false }),
      data: [
        folder("run-logs", ok({ bytes: 1_100_000_000, complete: true })),
        folder("caches", ok({ bytes: 300_000_000, complete: true })),
      ],
    });

    expect(line).toEqual({
      check: "disk",
      status: "ok",
      freeBytes: 48_000_000_000,
      data: { bytes: 1_400_000_000, runLogBytes: 1_100_000_000, complete: true },
      problem: null,
    });
  });

  it("warns when the disk is low, and doctor still exits 0", () => {
    const line = diskLine({ disk: ok({ freeBytes: 800_000_000, low: true }), data: [] });

    expect(line).toMatchObject({ status: "warning", freeBytes: 800_000_000, problem: "low" });
    expect(doctorSummary([line]).needsFixing).toBe(false);
  });

  it("warns when the free space can't be read", () => {
    const line = diskLine({ disk: err(new Error("statfs failed")), data: [] });

    expect(line).toMatchObject({ status: "warning", freeBytes: null, problem: "unreadable" });
  });

  it("leaves out what Halonic uses when a folder's size can't be read", () => {
    const line = diskLine({
      disk: ok({ freeBytes: 48_000_000_000, low: false }),
      data: [
        folder("run-logs", ok({ bytes: 1_100_000_000, complete: true })),
        folder("caches", err(new Error("permission denied"))),
      ],
    });

    expect(line).toMatchObject({ status: "ok", freeBytes: 48_000_000_000, data: null });
  });

  it("marks the total incomplete when the probe stopped counting a folder", () => {
    const line = diskLine({
      disk: ok({ freeBytes: 48_000_000_000, low: false }),
      data: [
        folder("run-logs", ok({ bytes: 1_100_000_000, complete: true })),
        folder("caches", ok({ bytes: 300_000_000, complete: false })),
      ],
    });

    expect(line.data).toEqual({
      bytes: 1_400_000_000,
      runLogBytes: 1_100_000_000,
      complete: false,
    });
  });
});
