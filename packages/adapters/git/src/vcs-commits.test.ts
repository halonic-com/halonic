import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { repositoryWith, Scratch, testAuthor, testRunner } from "./fixtures.test-helper.ts";
import { GitVcs } from "./vcs.ts";

const scratch = new Scratch();
afterAll(() => scratch.remove());

verifies("git.vcs-commits", () => {
  describe("before git part 5 of HAL-3245", () => {
    it("refuses Create version and every proposal ref method by name and changes nothing", async () => {
      const folder = await repositoryWith(scratch, { "a.yaml": "1\n" });
      const vcs = new GitVcs(folder, { runner: await testRunner(scratch), author: testAuthor });
      const [head] = await vcs.log(1);
      const ref = "refs/halonic/proposals/run-1";
      const before = await vcs.status();
      const calls: [string, () => Promise<unknown>][] = [
        ["commitVersion", () => vcs.commitVersion({ message: "Save", exclude: [] })],
        ["commitWorktreeTo", () => vcs.commitWorktreeTo("wt-1", ref, { parent: head?.hash ?? "" })],
        ["readRef", () => vcs.readRef(ref)],
        ["deleteRef", () => vcs.deleteRef(ref)],
      ];
      for (const [method, call] of calls) {
        await expect(call()).rejects.toThrow(`The git Vcs can't ${method} yet`);
      }
      expect(await vcs.status()).toEqual(before);
      expect(await vcs.log(2)).toEqual([head]);
    });
  });
});
