import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { s } from "./index.ts";
import { expectSameOutcome } from "./test/compare.ts";
import { urlLikeText } from "./test/url-arbitrary.ts";

const seed = Number(process.env["SCHEMA_KIT_SEED"] ?? 20261107);

describe("schema-kit.string-url", () => {
  const url = s.string().url();

  it("accepts absolute URLs of any scheme", () => {
    for (const text of [
      "https://example.com/mcp",
      "http://localhost:8080",
      "mailto:a@b",
      "a:b",
      "file:///tmp/x",
    ]) {
      expect(url.safeParse(text).ok, text).toBe(true);
    }
  });

  it("accepts IPv4 and IPv6 hosts", () => {
    for (const text of [
      "http://127.0.0.1/",
      "http://0x7f.1/",
      "http://[::1]:3000/",
      "http://[::ffff:1.2.3.4]/",
    ]) {
      expect(url.safeParse(text).ok, text).toBe(true);
    }
  });

  it("refuses text without a scheme, empty hosts, bad ports and bad addresses", () => {
    for (const text of [
      "example.com",
      "/path",
      "http://",
      "http://:80",
      "http://a:65536",
      "http://1.2.3.256",
      "http://[1::2::3]",
    ]) {
      expect(url.safeParse(text).ok, text).toBe(false);
    }
  });

  it("refuses hosts with spaces or other forbidden characters", () => {
    for (const text of ["https://exa mple.com", "http://a<b/", "http://a%2Fb/", "foo://a\\b"]) {
      expect(url.safeParse(text).ok, text).toBe(false);
    }
  });

  it("trims spaces and drops tabs and line breaks from the parsed value", () => {
    expect(url.parse("  https://exa\nmple.com/  ")).toBe("https://example.com/");
  });

  it("reports an invalid_format issue at the value's path", () => {
    const result = s.object({ baseUrl: url }).safeParse({ baseUrl: "nope" });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toEqual([
        {
          code: "invalid_format",
          path: ["baseUrl"],
          message: "Expected a URL, such as https://example.com",
        },
      ]);
  });

  it("accepts hosts with non-ASCII letters without IDNA checks (the documented gap)", () => {
    expect(url.safeParse("https://bücher.example/").ok).toBe(true);
  });
});

describe("schema-kit.zod-parity", () => {
  describe("URLs", () => {
    it("gives Zod's pass or fail and value on generated URL-like text", () => {
      const zodUrl = z.string().url();
      const kitUrl = s.string().url();
      fc.assert(
        fc.property(urlLikeText, (text) => expectSameOutcome(zodUrl, kitUrl, text)),
        { seed, numRuns: 3000 },
      );
    });
  });
});
