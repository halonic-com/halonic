import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { repositoryWith, Scratch, testRunner } from "./fixtures.test-helper.ts";
import { hardenedEnvironment } from "./hardening.ts";
import { Repository } from "./repository.ts";

const scratch = new Scratch();
afterAll(() => scratch.remove());

verifies("git.no-lazy-fetch", () => {
  describe("objects the repository lacks", () => {
    it("runs every call with lazy fetching off, whatever the inherited environment says", () => {
      const environment = hardenedEnvironment({ GIT_NO_LAZY_FETCH: "0" }, {}, []);
      expect(environment["GIT_NO_LAZY_FETCH"]).toBe("1");
    });

    const cases: readonly [label: string, text: string, key: string][] = [
      [
        "a partial clone, in mixed case",
        "[Extensions]\n\tPartialClone = origin",
        "extensions.partialclone",
      ],
      [
        "a promisor remote, in mixed case",
        '[remote "planted"]\n\turl = https://planted.invalid/a.git\n\tPromisor = true',
        "remote.planted.promisor",
      ],
    ];
    for (const [label, text, key] of cases) {
      it(`refuses a repository whose own config makes it ${label}`, async () => {
        const folder = await repositoryWith(scratch);
        await appendFile(join(folder, ".git", "config"), `${text}\n`);
        await expect(Repository.open(await testRunner(scratch), folder)).rejects.toThrow(key);
      });
    }

    it("opens a repository whose remote is a plain one", async () => {
      const folder = await repositoryWith(scratch);
      await appendFile(
        join(folder, ".git", "config"),
        '[remote "origin"]\n\turl = https://acme.example/a.git\n',
      );
      await expect(Repository.open(await testRunner(scratch), folder)).resolves.not.toBeNull();
    });
  });
});
