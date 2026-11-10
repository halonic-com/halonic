import { describe, expect, it } from "vitest";
import { printable } from "./printable.ts";

describe("printable", () => {
  it("shows an escape, a carriage return and a bidi control as their codes", () => {
    expect(printable("a\u001b[31mb\rc\u202ed")).toBe("a\\u001b[31mb\\u000dc\\u202ed");
  });

  it("leaves accents, emoji and the marks as they are", () => {
    expect(printable("Café 🙂 ✓ · ›")).toBe("Café 🙂 ✓ · ›");
  });
});
