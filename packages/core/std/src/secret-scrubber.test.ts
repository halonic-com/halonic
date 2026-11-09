import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { SecretScrubber, secretRemoved, secretTextForms } from "./secret-scrubber.ts";

// Made-up values, not shaped like any real key, so the leak guard and
// `gitleaks` find nothing here.
const token = "made-up-token-42";

function scrubberFor(...secrets: string[]): SecretScrubber {
  const scrubber = new SecretScrubber();
  for (const secret of secrets) scrubber.remember(secret);
  return scrubber;
}

verifies("std.secret-scrubber", () => {
  it("replaces a remembered secret wherever it appears", () => {
    const scrubbed = scrubberFor(token).scrub(`GET /v1?key=${token} failed\nretry ${token}`);
    expect(scrubbed).toBe(`GET /v1?key=${secretRemoved} failed\nretry ${secretRemoved}`);
  });

  it("leaves text without a remembered secret as it is", () => {
    expect(new SecretScrubber().scrub(`key=${token}`)).toBe(`key=${token}`);
    expect(scrubberFor(token).scrub("nothing to see")).toBe("nothing to see");
  });

  describe("finds the encoded forms", () => {
    const secret = "p@ss word/(1)!";
    it.each([
      ["URL-encoded", encodeURIComponent(secret)],
      ["URL-encoded with lowercase escapes", "p%40ss%20word%2f(1)!"],
      ["form-encoded", new URLSearchParams([["", secret]]).toString().slice(1)],
      ["JSON-escaped", JSON.stringify(secret).slice(1, -1)],
      ["JSON-escaped with an escaped slash", "p@ss word\\/(1)!"],
    ])("%s", (_name, form) => {
      expect(scrubberFor(secret).scrub(`before ${form} after`)).toBe(
        `before ${secretRemoved} after`,
      );
    });
  });

  it("finds a secret that holds a line break, raw and JSON-escaped", () => {
    const pem = "-----BEGIN KEY-----\nmade-up\n-----END KEY-----";
    const scrubber = scrubberFor(pem);
    expect(scrubber.scrub(`loaded ${pem} from disk`)).toBe(`loaded ${secretRemoved} from disk`);
    expect(scrubber.scrub(JSON.stringify({ key: pem }))).toBe(`{"key":"${secretRemoved}"}`);
  });

  it("removes the longer of two secrets whole when one contains the other", () => {
    const short = "inner-42";
    const long = `outer-${short}-tail`;
    for (const scrubber of [scrubberFor(short, long), scrubberFor(long, short)]) {
      expect(scrubber.scrub(`a ${long} b ${short} c`)).toBe(
        `a ${secretRemoved} b ${secretRemoved} c`,
      );
    }
  });

  it("removes both of two secrets that overlap without one containing the other", () => {
    for (const scrubber of [scrubberFor("xab1", "ab1cd"), scrubberFor("ab1cd", "xab1")]) {
      expect(scrubber.scrub("-xab1cd-")).toBe(`-${secretRemoved}-`);
    }
    expect(scrubberFor("AAAA-BBBB", "BBBB-CCCC").scrub("AAAA-BBBB-CCCC")).toBe(secretRemoved);
  });

  it("makes copies that touch or overlap one marker", () => {
    expect(scrubberFor("ab").scrub("-abab-")).toBe(`-${secretRemoved}-`);
    expect(scrubberFor("aa").scrub("-aaa-")).toBe(`-${secretRemoved}-`);
  });

  it("never finds a secret inside a marker it wrote", () => {
    const scrubber = scrubberFor("made-up-token", "e");
    expect(scrubber.scrub("made-up-token e")).toBe(`${secretRemoved} ${secretRemoved}`);
  });

  it("ignores an empty secret, and scrubs a one-letter one", () => {
    expect(scrubberFor("").scrub("abc")).toBe("abc");
    expect(scrubberFor("b").scrub("abc")).toBe(`a${secretRemoved}c`);
  });

  it("keeps scrubbing what it already knows after it learns more", () => {
    const scrubber = scrubberFor(token);
    scrubber.remember("second-made-up");
    scrubber.remember(token);
    expect(scrubber.scrub(`${token} second-made-up`)).toBe(`${secretRemoved} ${secretRemoved}`);
  });
});

describe("secretTextForms", () => {
  it("lists the value, its URL, form and JSON forms, in that order", () => {
    expect(secretTextForms("a b")).toEqual(["a b", "a%20b", "a%20b", "a+b", "a b", "a b"]);
  });

  it("has no forms for an empty value", () => {
    expect(secretTextForms("")).toEqual([]);
  });

  it("form-encodes as URLSearchParams does", () => {
    const value = "a b!'()~*-._/é\u{1F511}\uD800";
    const expected = new URLSearchParams([["", value]]).toString().slice(1);
    expect(secretTextForms(value)[3]).toBe(expected);
  });
});
