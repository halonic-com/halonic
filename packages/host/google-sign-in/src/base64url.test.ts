import { describe, expect, it } from "vitest";
import { encodeBase64url } from "./base64url.ts";

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

describe("google-sign-in: base64url", () => {
  it("encodes the RFC 4648 test vectors without padding", () => {
    expect(encodeBase64url(text(""))).toBe("");
    expect(encodeBase64url(text("f"))).toBe("Zg");
    expect(encodeBase64url(text("fo"))).toBe("Zm8");
    expect(encodeBase64url(text("foo"))).toBe("Zm9v");
    expect(encodeBase64url(text("foob"))).toBe("Zm9vYg");
    expect(encodeBase64url(text("fooba"))).toBe("Zm9vYmE");
    expect(encodeBase64url(text("foobar"))).toBe("Zm9vYmFy");
  });

  it("uses - and _ where base64 uses + and /", () => {
    expect(encodeBase64url(new Uint8Array([0xfb, 0xff]))).toBe("-_8");
  });

  it("gives the same text as Node's base64url for every length", () => {
    for (let length = 0; length <= 40; length += 1) {
      const bytes = crypto.getRandomValues(new Uint8Array(length));
      expect(encodeBase64url(bytes)).toBe(Buffer.from(bytes).toString("base64url"));
    }
  });
});
