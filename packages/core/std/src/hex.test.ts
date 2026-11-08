import { describe, expect, it } from "vitest";
import { bytesToHex } from "./hex.ts";

describe("std.hex", () => {
  it("writes each byte as two lowercase hex characters", () => {
    expect(bytesToHex(new Uint8Array([0, 171, 255]))).toBe("00abff");
  });

  it("writes nothing for no bytes", () => {
    expect(bytesToHex(new Uint8Array())).toBe("");
  });
});
