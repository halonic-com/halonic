import { parse } from "@halonicjs/schema-kit";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { strictParameters } from "./strict-parameters.ts";

const parameters = strictParameters({
  owner: { kind: "text", pattern: /^[A-Za-z0-9-]{1,39}$/ },
  repo: { kind: "text", pattern: /^[A-Za-z0-9._-]{1,100}$/ },
  runs: { kind: "integer", min: 1, max: 10, optional: true },
});

verifies("action-steppers.strict-parameters", () => {
  describe("strictParameters", () => {
    it("takes values that match their patterns", () => {
      expect(parse(parameters, { owner: "acme", repo: "app", runs: 2 })).toEqual({
        ok: true,
        value: { owner: "acme", repo: "app", runs: 2 },
      });
    });

    it.each([
      "../secrets",
      "app%2Fsecrets",
      "app?x=1",
      "https://evil.example/app",
      "..",
      "app#top",
    ])("refuses the path trick %s", (trick) => {
      expect(parse(parameters, { owner: "acme", repo: trick }).ok).toBe(false);
    });

    it("refuses a dot-only value even when its own pattern allows dots", () => {
      expect(parse(parameters, { owner: "acme", repo: "." }).ok).toBe(false);
    });

    it("refuses an unknown key", () => {
      const parsed = parse(parameters, { owner: "acme", repo: "app", path: "/x" });
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.error[0]?.code).toBe("unrecognized_keys");
    });

    it("refuses an integer out of range", () => {
      expect(parse(parameters, { owner: "acme", repo: "app", runs: 11 }).ok).toBe(false);
    });

    it("refuses a definition whose pattern isn't anchored", () => {
      expect(() => strictParameters({ repo: { kind: "text", pattern: /[a-z]+/ } })).toThrow(
        /must start with \^/,
      );
    });
  });
});
