import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { CallChecks, keepsCheck, skipsNestedListing } from "./check-scope.ts";

verifies("git.repository", () => {
  describe("which git commands keep a check within one port call", () => {
    it.each([
      ["rev-parse", "--verify", "--quiet", "HEAD"],
      ["cat-file", "--batch"],
      ["ls-files", "-z", "--others", "--", "a.yaml"],
      ["diff-index", "--cached", "--name-only", "-z", "HEAD"],
      ["diff", "--cached", "--no-color", "--", "a.yaml"],
      ["write-tree"],
      ["commit-tree", "-p", "HEAD", "-m", "Change", "abc"],
      ["update-ref", "HEAD", "abc", "def"],
      ["symbolic-ref", "--quiet", "--short", "HEAD"],
      ["config", "--get", "--", "branch.main.remote"],
      ["remote"],
    ])("keeps it for a command that only reads, or writes only objects and refs: %s", (...args) => {
      expect(keepsCheck(args)).toBe(true);
    });

    it.each([
      ["add", "--all", "--", "."],
      ["reset", "--quiet", "--", "a.yaml"],
      ["read-tree", "--empty"],
      ["checkout-index", "--all", "--quiet"],
      ["switch", "--quiet", "--create", "next"],
      ["commit", "--quiet", "--message=Change"],
      ["worktree", "add", "--detach", "--", "wt", "abc"],
      ["apply", "--numstat", "-z", "--", "change.diff"],
      ["pull", "--quiet", "--ff-only"],
      ["fetch", "--quiet", "--", "origin"],
      ["diff", "--no-color", "--", "a.yaml"],
      ["symbolic-ref", "HEAD", "refs/heads/next"],
      ["config", "--replace-all", "core.bare", "true"],
      ["remote", "add", "acme", "https://git.acme.example/acme.git"],
      ["stash"],
      ["gc"],
    ])("ends it for any other command: %s", (...args) => {
      expect(keepsCheck(args)).toBe(false);
    });
  });

  describe("which git commands skip the nested-repository listing", () => {
    it.each([
      ["log", "-n", "5"],
      ["cat-file", "-t", "abc"],
      ["rev-parse", "HEAD"],
      ["show-ref", "--verify", "--quiet", "refs/heads/main"],
      ["diff", "--cached", "--no-color", "--", "a.yaml"],
      ["ls-files", "-z", "--", "a.yaml"],
      ["read-tree", "--empty"],
      ["read-tree", "abc"],
      ["write-tree"],
      ["commit-tree", "-m", "Change", "abc"],
      ["update-ref", "-d", "refs/halonic/acme", "abc"],
    ])(
      "skips it for a command that reads only objects, refs, the config and the index: %s",
      (...args) => {
        expect(skipsNestedListing(args)).toBe(true);
      },
    );

    it.each([
      ["add", "--all", "--", "."],
      ["status", "--porcelain=v2"],
      ["diff", "--no-color", "--", "a.yaml"],
      ["diff", "--cached", "--no-index", "a", "b"],
      ["ls-files", "-z", "--others"],
      ["ls-files", "-zo"],
      ["ls-files", "--modified"],
      ["read-tree", "-u", "abc"],
      ["read-tree", "--reset", "-u", "abc"],
      ["reset", "--hard"],
      ["apply", "--", "change.diff"],
      ["apply", "--numstat", "--", "change.diff"],
      ["checkout", "--quiet", "--", "a.yaml"],
      ["stash"],
      ["clean", "--force"],
      ["rm", "--cached", "--", "a.yaml"],
      ["mv", "--", "a.yaml", "b.yaml"],
      ["grep", "acme"],
      ["constructor"],
    ])("runs it for any other command: %s", (...args) => {
      expect(skipsNestedListing(args)).toBe(false);
    });
  });

  describe("the checks of one port call", () => {
    it("holds a check until a command that doesn't keep it starts", async () => {
      const checks = new CallChecks<string>();
      checks.hold(checks.epoch, { result: "checked", withListing: false });
      await checks.running(["rev-parse", "HEAD"], async () => {});
      expect(checks.held(false)).toBe("checked");
      // A check without the listing doesn't serve a command that needs it.
      expect(checks.held(true)).toBeNull();
      let heldWhileRunning: string | null = "unset";
      await checks.running(["add", "--all"], async () => {
        heldWhileRunning = checks.held(false);
      });
      expect(heldWhileRunning).toBeNull();
      expect(checks.held(false)).toBeNull();
    });

    it("ends a check when the adapter writes a file itself", () => {
      const checks = new CallChecks<string>();
      checks.hold(checks.epoch, { result: "checked", withListing: true });
      checks.changed();
      expect(checks.held(true)).toBeNull();
      expect(checks.held(false)).toBeNull();
    });

    it("never holds a check that ran while something changed", async () => {
      const checks = new CallChecks<string>();
      const startedBefore = checks.epoch;
      let finish = (): void => {};
      const adding = checks.running(
        ["add", "--all"],
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
      // A check that started during `add` must not be held, nor one from before it.
      checks.hold(checks.epoch, { result: "during", withListing: true });
      checks.hold(startedBefore, { result: "before", withListing: true });
      expect(checks.held(false)).toBeNull();
      finish();
      await adding;
      expect(checks.held(false)).toBeNull();
      const startedNow = checks.epoch;
      checks.changed();
      checks.hold(startedNow, { result: "stale", withListing: true });
      expect(checks.held(false)).toBeNull();
    });
  });
});
