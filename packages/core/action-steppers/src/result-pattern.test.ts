import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { compileResultPattern, countMatchChecks, maxResultLength } from "./result-pattern.ts";

function matcher(pattern: string): (value: string) => boolean {
  const compiled = compileResultPattern(pattern);
  if (!compiled.ok) throw new Error(compiled.error);
  return compiled.value.matches;
}

verifies("action-steppers.stepper-request", () => {
  describe("compileResultPattern", () => {
    it("matches a project id the way the regular expression would", () => {
      const projectId = matcher("^[a-z][a-z0-9-]{5,29}$");
      expect(projectId("acme-prod")).toBe(true);
      expect(projectId("Acme-prod")).toBe(false);
      expect(projectId("acme")).toBe(false);
      expect(projectId(`a${"b".repeat(29)}`)).toBe(true);
      expect(projectId(`a${"b".repeat(30)}`)).toBe(false);
    });

    it("takes \\d, \\w, escaped punctuation, ? and + counts", () => {
      const version = matcher("^v\\d+\\.\\d+x?$");
      expect(version("v12.3")).toBe(true);
      expect(version("v12.3x")).toBe(true);
      expect(version("v12-3")).toBe(false);
      expect(matcher("^\\w*$")("acme_prod1")).toBe(true);
    });

    it.each(["^(a+)+$", "^a|b$", "^.*$", "^\\1$", "^[^a]$", "^a{2,1}$", "^[z-a]$", "a+", "^\\s$"])(
      "refuses the pattern %s",
      (pattern) => {
        expect(compileResultPattern(pattern).ok).toBe(false);
      },
    );

    it("stays within atoms × length × (length + 1) checks on a value built to backtrack, and refuses values over the limit", () => {
      const atomCount = 30;
      const pattern = `^${"[a-z]*".repeat(atomCount)}b$`;
      const value = "a".repeat(maxResultLength);
      expect(matcher(pattern)(value)).toBe(false);
      const checks = countMatchChecks(pattern, value);
      expect(checks.ok).toBe(true);
      expect(checks.ok && checks.value).toBeLessThanOrEqual(
        (atomCount + 1) * maxResultLength * (maxResultLength + 1),
      );
      expect(matcher("^a*$")("a".repeat(maxResultLength + 1))).toBe(false);
    });
  });
});
