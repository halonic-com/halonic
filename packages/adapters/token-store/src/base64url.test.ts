import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { decodeBase64url, encodeBase64url } from "./base64url.ts";

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

verifies("token-store.token-key", () => {
  it("encodes without padding, using - and _", () => {
    expect(encodeBase64url(text(""))).toBe("");
    expect(encodeBase64url(text("f"))).toBe("Zg");
    expect(encodeBase64url(text("fo"))).toBe("Zm8");
    expect(encodeBase64url(text("foo"))).toBe("Zm9v");
    expect(encodeBase64url(new Uint8Array([0xfb, 0xff]))).toBe("-_8");
  });

  it("decodes what it encodes, for every length", () => {
    for (let length = 0; length <= 40; length += 1) {
      const bytes = crypto.getRandomValues(new Uint8Array(length));
      expect(decodeBase64url(encodeBase64url(bytes))).toEqual(bytes);
    }
  });

  it("refuses padding, other characters, impossible lengths and stray bits", () => {
    expect(decodeBase64url("Zg==")).toBeUndefined();
    expect(decodeBase64url("Zm+v")).toBeUndefined();
    expect(decodeBase64url("Zm/v")).toBeUndefined();
    expect(decodeBase64url("Zm9 v")).toBeUndefined();
    expect(decodeBase64url("Zm9vZ")).toBeUndefined();
    expect(decodeBase64url("Zh")).toBeUndefined();
    expect(decodeBase64url("Zm9")).toBeUndefined();
  });
});
