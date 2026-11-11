import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { cantOpenProblem } from "./cant-open.ts";

verifies("shell.welcome-cant-open", () => {
  it("says the folder is gone when it isn't there", () => {
    expect(cantOpenProblem("/work/old", new KindedError("not_found", "No folder"))).toEqual({
      folder: "/work/old",
      kind: "not_found",
      reason: "the folder is gone.",
    });
  });

  it("says the user can't read it when access is denied", () => {
    expect(cantOpenProblem("/work/old", { kind: "denied", message: "EACCES" }).reason).toBe(
      "you don't have permission to read it.",
    );
  });

  it("says the engine's own reason for any other kind, as a sentence", () => {
    const problem = cantOpenProblem("/work/acme", new KindedError("unavailable", "Disk is busy"));
    expect(problem.reason).toBe("Disk is busy.");
    expect(problem.details).toBeUndefined();
  });

  it("hides a reason without a kind and keeps it for Copy details", () => {
    const problem = cantOpenProblem("/work/acme", new TypeError("scope is undefined"));
    expect(problem).toMatchObject({
      kind: "internal",
      reason: "Halonic ran into a problem it can't explain yet.",
    });
    expect(problem.details).toMatch(/^Can't open \/work\/acme\nTypeError: scope is undefined/);
  });
});
