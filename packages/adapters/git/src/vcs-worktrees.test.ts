import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { repositoryWith, Scratch, testAuthor, testRunner } from "./fixtures.test-helper.ts";
import { GitVcs } from "./vcs.ts";

const scratch = new Scratch();
afterAll(() => scratch.remove());

verifies("git.vcs-worktrees", () => {
  describe("before git part 4 of HAL-3245", () => {
    it("refuses every worktree method by name and changes nothing", async () => {
      const folder = await repositoryWith(scratch, { "a.yaml": "1\n" });
      const vcs = new GitVcs(folder, { runner: await testRunner(scratch), author: testAuthor });
      const [head] = await vcs.log(1);
      const before = await vcs.status();
      const calls: [string, () => Promise<unknown>][] = [
        ["addWorktree", () => vcs.addWorktree(head?.hash ?? "")],
        ["removeWorktree", () => vcs.removeWorktree("wt-1")],
        ["listWorktrees", () => vcs.listWorktrees()],
        ["diffBetween", () => vcs.diffBetween(head?.hash ?? "", "wt-1")],
        ["applyPatch", () => vcs.applyPatch("--- a/a.yaml\n+++ b/a.yaml\n")],
      ];
      for (const [method, call] of calls) {
        await expect(call()).rejects.toThrow(`The git Vcs can't ${method} yet`);
      }
      expect(await vcs.status()).toEqual(before);
      expect(await vcs.log(2)).toEqual([head]);
    });
  });
});
