import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { HostTooOld, isHostTooOld } from "./index.ts";

verifies("ports.host-too-old", () => {
  it("is a RangeError that keeps its message", () => {
    const error = new HostTooOld("Update the host.");
    expect(isHostTooOld(error)).toBe(true);
    expect(error).toBeInstanceOf(RangeError);
    expect(error).toMatchObject({ name: "HostTooOld", message: "Update the host." });
  });

  it("accepts an error from another copy of the package", () => {
    const other = Object.assign(new RangeError("other"), { name: "HostTooOld" });
    expect(isHostTooOld(other)).toBe(true);
  });

  it("refuses anything else", () => {
    expect(isHostTooOld(new Error("no"))).toBe(false);
    expect(isHostTooOld(new RangeError("no"))).toBe(false);
    expect(isHostTooOld({ name: "HostTooOld", message: "no" })).toBe(false);
  });
});
