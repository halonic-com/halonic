import { describe, expect, it } from "vitest";
import { shownSize } from "./size.ts";

const gb = 1024 ** 3;

describe("shownSize", () => {
  it("writes the sizes of cli-output 3.7", () => {
    expect([48 * gb, 1.4 * gb, 1.1 * gb, 2 * gb, 0.8 * gb].map(shownSize)).toEqual([
      "48 GB",
      "1.4 GB",
      "1.1 GB",
      "2.0 GB",
      "0.8 GB",
    ]);
  });

  it("moves to a smaller unit below 0.1 of the larger one", () => {
    expect(shownSize(50 * 1024 ** 2)).toBe("50 MB");
    expect(shownSize(5 * 1024 ** 2)).toBe("5.0 MB");
    expect(shownSize(2048)).toBe("2.0 KB");
  });

  it("writes a size that rounds to 10 as a whole number", () => {
    expect(shownSize(9.96 * gb)).toBe("10 GB");
    expect(shownSize(9.94 * gb)).toBe("9.9 GB");
  });

  it("stops at TB, and writes nothing as 0 KB", () => {
    expect(shownSize(3 * 1024 ** 5)).toBe("3072 TB");
    expect(shownSize(0)).toBe("0 KB");
  });
});
