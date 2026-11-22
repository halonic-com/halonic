import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  cantOpenProblem,
  cantReopenProblem,
  offersRemoveFromRecent,
  profileInsideFix,
} from "./cant-open.ts";

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
    const problem = cantOpenProblem("/work/acme", new KindedError("invalid_input", "Disk is busy"));
    expect(problem.reason).toBe("Disk is busy.");
    expect(problem.details).toBeUndefined();
  });

  it("says the engine isn't answering when it doesn't, never in the shell's words", () => {
    const problem = cantOpenProblem(
      "/work/odd",
      new KindedError("unavailable", "The desktop shell gave no answer about the folder."),
    );
    expect(problem).toEqual({
      folder: "/work/odd",
      kind: "unavailable",
      reason: "the engine isn't answering. It may still be starting.",
    });
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

describe("cantReopenProblem", () => {
  it("asks for the folder to be picked again when the app won't reopen it", () => {
    expect(cantReopenProblem("/work/acme", new KindedError("conflict", "not picked"))).toEqual({
      folder: "/work/acme",
      kind: "conflict",
      reason: "pick the folder again.",
      pickAgain: true,
    });
  });

  it("reads any other reason as a folder that fails to open", () => {
    expect(cantReopenProblem("/work/old", new KindedError("not_found", "gone"))).toEqual(
      cantOpenProblem("/work/old", new KindedError("not_found", "gone")),
    );
  });
});

verifies("shell.profile-place-words", () => {
  const moved =
    "A change to this workspace could change what you trust. Move the profile folder out, set HALONIC_HOME to its new place, then quit Halonic and open it again.";

  it("says a picked folder holds the profile folder, and the fix names HALONIC_HOME", () => {
    const refusal = { kind: "profile_inside", message: "holds it", reason: "HALONIC_HOME" };
    expect(cantOpenProblem("the folder", refusal)).toEqual({
      folder: "the folder",
      kind: "denied",
      reason: "your profile folder is inside it.",
      fix: moved,
    });
  });

  it("names another variable that moved the profile in the fix only", () => {
    const refusal = { kind: "profile_inside", message: "holds it", reason: "XDG_DATA_HOME" };
    const problem = cantOpenProblem("acme", refusal);
    expect(problem.reason).toBe("your profile folder is inside it.");
    expect(problem.fix).toBe(`XDG_DATA_HOME puts it there. ${moved}`);
    expect(profileInsideFix("LOCALAPPDATA")).toBe(`LOCALAPPDATA puts it there. ${moved}`);
  });

  it("reads a reopen's refusal from its cause, and offers Remove from Recent", () => {
    const cause = { kind: "workspace_inside_profile", message: "inside it" };
    const error = new KindedError("denied", "The shell refused: inside it", { cause });
    const problem = cantReopenProblem("acme", error);
    expect(problem).toEqual({
      folder: "acme",
      kind: "denied",
      reason: "it's inside your profile folder, where Halonic keeps its own files.",
      fix: "Move the workspace out of it, then open it from its new place.",
      removeFromRecent: true,
    });
    expect(offersRemoveFromRecent(problem)).toBe(true);
  });

  it("offers Remove from Recent for a gone folder but not for a moved profile", () => {
    expect(offersRemoveFromRecent({ folder: "a", kind: "not_found", reason: "gone." })).toBe(true);
    const refusal = { kind: "profile_inside", message: "holds it" };
    expect(offersRemoveFromRecent(cantOpenProblem("a", refusal))).toBe(false);
  });
});
