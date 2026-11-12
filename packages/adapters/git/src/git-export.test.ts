import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { plainGit, repositoryWith, Scratch } from "./fixtures.test-helper.ts";
import { checkGitAddress, checkGitExport, exportCommit } from "./git-export.ts";
import { remoteRunner, sshRemote } from "./harness.test-helper.ts";

const scratch = new Scratch();
afterAll(() => scratch.remove());

/** An address with a password, put together so no file holds one. */
function withPassword(password: string): string {
  const url = new URL("https://example.com/a.git");
  url.username = "me";
  url.password = password;
  return url.href;
}

verifies("git.export", () => {
  describe("checkGitAddress", () => {
    it.each([
      ["an option", "--upload-pack=touch marker"],
      ["a dash host", "ssh://-oProxyCommand=x/repo"],
      ["ext::", "ext::sh -c touch% marker"],
      ["a local path", "/srv/repo.git"],
      ["file://", "file:///srv/repo.git"],
      ["git://", "git://example.com/a.git"],
      ["plain http", "http://example.com/a.git"],
      ["a space", "https://example.com/a b.git"],
      ["a password", withPassword("pw")],
    ])("refuses %s", (_name, address) => {
      expect(() => checkGitAddress(address)).toThrow("Can't use that git address");
    });

    it("never echoes a password in its error", () => {
      expect(() => checkGitAddress(withPassword("hunter2"))).not.toThrow(/hunter2/);
    });

    it.each(["https://example.com/a.git", "ssh://git@example.com/a.git"])("accepts %s", (a) => {
      expect(() => checkGitAddress(a)).not.toThrow();
    });
  });

  describe("checkGitExport", () => {
    it("refuses an unsafe commit with a safe address, without git", () => {
      expect(() => checkGitExport("https://example.com/a.git", "--upload-pack=x")).toThrow(
        "Can't use",
      );
    });

    it("accepts a safe address with no commit or a tag", () => {
      expect(() => checkGitExport("https://example.com/a.git")).not.toThrow();
      expect(() => checkGitExport("https://example.com/a.git", "v1.2.0")).not.toThrow();
    });
  });

  describe("exportCommit", () => {
    it("writes the files of the remote's HEAD with no .git, and gives the full id", async () => {
      const remote = await repositoryWith(scratch, {
        "plugin.yaml": "id: weather\n",
        "a/b.txt": "b\n",
      });
      const destination = join(await scratch.folder(), "out");
      const { commit, branch } = await exportCommit(
        await remoteRunner(scratch),
        sshRemote(remote),
        destination,
      );
      expect(commit).toBe((await plainGit(remote, ["rev-parse", "HEAD"])).trim());
      expect(branch).toBe((await plainGit(remote, ["branch", "--show-current"])).trim());
      expect(await readFile(join(destination, "a", "b.txt"), "utf8")).toBe("b\n");
      await expect(lstat(join(destination, ".git"))).rejects.toThrow();
    });

    it("exports a named commit, not the latest", async () => {
      const remote = await repositoryWith(scratch, { "a.txt": "one\n" });
      const first = (await plainGit(remote, ["rev-parse", "HEAD"])).trim();
      await plainGit(remote, ["commit", "--quiet", "--allow-empty", "--message=Second"]);
      const destination = join(await scratch.folder(), "out");
      const { commit, branch } = await exportCommit(
        await remoteRunner(scratch),
        sshRemote(remote),
        destination,
        first,
      );
      expect(commit).toBe(first);
      expect(branch).toBeUndefined();
    });

    it.each(["--upload-pack=x", "-x", "main..other", "a b", "HEAD~1", ":/x"])(
      "refuses the commit %s before reaching the remote",
      async (ref) => {
        const destination = join(await scratch.folder(), "out");
        await expect(
          exportCommit(await remoteRunner(scratch), "ssh://acme.invalid/x.git", destination, ref),
        ).rejects.toThrow("Can't use");
      },
    );

    it("refuses a local-path address before running git", async () => {
      const remote = await repositoryWith(scratch);
      const destination = join(await scratch.folder(), "out");
      await expect(exportCommit(await remoteRunner(scratch), remote, destination)).rejects.toThrow(
        "Can't use that git address",
      );
    });
  });
});
