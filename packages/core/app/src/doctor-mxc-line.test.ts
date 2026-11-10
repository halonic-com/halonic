import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { mxcLine } from "./doctor-mxc-line.ts";
import type { MxcStatus } from "./sandbox-choice.ts";

const offered = { offered: true, setting: null, effective: "on" } as const;

function lineFor(mxc: MxcStatus) {
  return mxcLine({ active: mxc.state === "in-use" ? "mxc" : null, mxc });
}

verifies("app.doctor-mxc", () => {
  it("fails when the person set MXC to on and its trust check failed", () => {
    const missing = ["the read-only file couldn't be read"];
    expect(
      lineFor({
        ...offered,
        setting: "on",
        state: "mxc-check-failed",
        reason: "too-strict",
        missing,
      }),
    ).toEqual({
      check: "mxc",
      status: "failed",
      state: "mxc-check-failed",
      setting: "on",
      effective: "on",
      reason: "too-strict",
      missing,
      nameLookupsLeave: null,
    });
  });

  it("warns when MXC was only on by default and its trust check failed", () => {
    expect(
      lineFor({ ...offered, state: "mxc-check-failed", reason: "port-reachable", missing: [] }),
    ).toMatchObject({ status: "warning", reason: "port-reachable" });
  });

  it("is ok while MXC is in use, and says whether name lookups leave the box", () => {
    expect(lineFor({ ...offered, state: "in-use", nameLookupsLeave: true })).toEqual({
      check: "mxc",
      status: "ok",
      state: "in-use",
      setting: null,
      effective: "on",
      reason: null,
      missing: [],
      nameLookupsLeave: true,
    });
  });

  it("is ok when MXC is off or not used", () => {
    expect(lineFor({ ...offered, effective: "off", state: "off" })).toMatchObject({
      status: "ok",
      state: "off",
      nameLookupsLeave: null,
    });
    expect(lineFor({ ...offered, state: "not-used" })).toMatchObject({
      status: "ok",
      state: "not-used",
    });
  });

  it("has no line where MXC isn't offered", () => {
    expect(lineFor({ ...offered, offered: false, state: "not-offered" })).toBeUndefined();
  });
});
