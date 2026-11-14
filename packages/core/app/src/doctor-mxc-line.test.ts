import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { mxcLine } from "./doctor-mxc-line.ts";
import type { SandboxBackendStatus, SandboxChoice } from "./sandbox-choice.ts";

const mxcStatus: SandboxBackendStatus = {
  id: "mxc",
  offered: true,
  state: "available",
  reason: null,
  missing: [],
  limits: [],
  residuals: [],
};

function lineFor(mxc: Partial<SandboxBackendStatus>, chosen: boolean) {
  const choice: SandboxChoice = {
    active: mxc.state === "in-use" ? "mxc" : null,
    setting: chosen ? { backend: "mxc", chosenAt: "2026-11-14T09:00:00.000Z" } : null,
    backends: [{ ...mxcStatus, ...mxc }],
  };
  return mxcLine(choice);
}

verifies("app.doctor-mxc", () => {
  it("fails when the person chose MXC and its trust check failed", () => {
    const missing = ["the read-only file couldn't be read"];
    expect(lineFor({ state: "check-failed", reason: "too-strict", missing }, true)).toEqual({
      check: "mxc",
      status: "failed",
      state: "check-failed",
      chosen: true,
      reason: "too-strict",
      missing,
      nameLookupsLeave: null,
    });
  });

  it("fails when the person chose MXC and it can't run at all", () => {
    expect(lineFor({ state: "setup-needed", reason: "setup-needed" }, true)).toMatchObject({
      status: "failed",
      reason: "setup-needed",
    });
  });

  it("warns when nobody chose MXC and its trust check failed", () => {
    expect(lineFor({ state: "check-failed", reason: "port-reachable" }, false)).toMatchObject({
      status: "warning",
      reason: "port-reachable",
    });
  });

  it("is ok while MXC is in use, and says whether name lookups leave the box", () => {
    expect(lineFor({ state: "in-use", residuals: ["name-lookups-leave"] }, true)).toEqual({
      check: "mxc",
      status: "ok",
      state: "in-use",
      chosen: true,
      reason: null,
      missing: [],
      nameLookupsLeave: true,
    });
    expect(lineFor({ state: "in-use" }, true)).toMatchObject({ nameLookupsLeave: false });
  });

  it("is ok when MXC is available and nobody chose it", () => {
    expect(lineFor({}, false)).toMatchObject({
      status: "ok",
      state: "available",
      nameLookupsLeave: null,
    });
  });

  it("has no line where MXC isn't offered, or isn't one of the backends", () => {
    expect(lineFor({ offered: false, state: "not-available" }, false)).toBeUndefined();
    expect(mxcLine({ active: null, setting: null, backends: [] })).toBeUndefined();
  });
});
