import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { decodeBase64url, encodeBase64url } from "./base64url.ts";
import { encodeUtf8 } from "./utf8.ts";

verifies("std.base64url", () => {
  it("encodes the RFC 4648 test vectors without padding", () => {
    expect(encodeBase64url(encodeUtf8(""))).toBe("");
    expect(encodeBase64url(encodeUtf8("f"))).toBe("Zg");
    expect(encodeBase64url(encodeUtf8("fo"))).toBe("Zm8");
    expect(encodeBase64url(encodeUtf8("foo"))).toBe("Zm9v");
    expect(encodeBase64url(encodeUtf8("foob"))).toBe("Zm9vYg");
    expect(encodeBase64url(encodeUtf8("fooba"))).toBe("Zm9vYmE");
    expect(encodeBase64url(encodeUtf8("foobar"))).toBe("Zm9vYmFy");
  });

  it("uses - and _ where base64 uses + and /", () => {
    expect(encodeBase64url(new Uint8Array([0xfb, 0xff]))).toBe("-_8");
    expect(decodeBase64url("-_8")).toEqual(new Uint8Array([0xfb, 0xff]));
  });

  it("gives the same text as Node's base64url for every length", () => {
    for (let length = 0; length <= 40; length += 1) {
      const bytes = crypto.getRandomValues(new Uint8Array(length));
      expect(encodeBase64url(bytes)).toBe(Buffer.from(bytes).toString("base64url"));
    }
  });

  it("decodes what it encodes, for every length", () => {
    for (let length = 0; length <= 40; length += 1) {
      const bytes = crypto.getRandomValues(new Uint8Array(length));
      expect(decodeBase64url(encodeBase64url(bytes))).toEqual(bytes);
    }
  });

  it("refuses padding, other characters, impossible lengths and stray bits", () => {
    expect(decodeBase64url("Zg==")).toBeUndefined();
    expect(decodeBase64url("Zm9v=")).toBeUndefined();
    expect(decodeBase64url("Zm+v")).toBeUndefined();
    expect(decodeBase64url("Zm/v")).toBeUndefined();
    expect(decodeBase64url("Zm9 v")).toBeUndefined();
    expect(decodeBase64url("Zm9vZ")).toBeUndefined();
    expect(decodeBase64url("Zh")).toBeUndefined();
    expect(decodeBase64url("Zm9")).toBeUndefined();
  });
});
