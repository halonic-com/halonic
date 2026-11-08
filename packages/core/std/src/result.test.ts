import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { err, mapResult, ok, unwrap } from "./result.ts";

verifies("std.result", () => {
  it("maps the value of a successful result", () => {
    expect(mapResult(ok(2), (n) => n * 10)).toEqual(ok(20));
  });

  it("passes a failed result through without calling the transform", () => {
    const failure = err("bad");
    let called = false;
    const mapped = mapResult(failure, () => {
      called = true;
    });
    expect(mapped).toBe(failure);
    expect(called).toBe(false);
  });

  it("unwraps the value of a successful result", () => {
    expect(unwrap(ok("x"))).toBe("x");
  });

  it("throws the carried Error when a failed result is unwrapped", () => {
    const error = new RangeError("too big");
    expect(() => unwrap(err(error))).toThrow(error);
  });

  it("throws an Error that names a non-Error failure", () => {
    expect(() => unwrap(err("bad"))).toThrow(/bad/);
  });
});
