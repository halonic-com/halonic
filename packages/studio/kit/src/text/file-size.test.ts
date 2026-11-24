import { describe, expect, it } from "vitest";
import { sizeText } from "./file-size.ts";

describe("sizeText", () => {
  it("says bytes, KB and MB as a file line reads them", () => {
    expect(sizeText(1)).toBe("1 byte");
    expect(sizeText(512)).toBe("512 bytes");
    expect(sizeText(2048)).toBe("2 KB");
    expect(sizeText(2.4 * 1024 * 1024)).toBe("2.4 MB");
  });

  it("says just under 1 MB as 1 MB, and a whole number of MB without .0", () => {
    expect(sizeText(1_048_575)).toBe("1 MB");
    expect(sizeText(10 * 1024 * 1024)).toBe("10 MB");
  });
});
