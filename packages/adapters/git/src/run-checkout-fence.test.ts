import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, it } from "vitest";
import { plainGit, repositoryWith, Scratch, testRunner } from "./fixtures.test-helper.ts";
import { makeRunCheckout } from "./run-checkout.ts";
import { makeRunCheckoutFence } from "./run-checkout-fence.ts";

const scratch = new Scratch();
afterAll(() => scratch.remove());

async function checkout(): Promise<string> {
  const shared = await repositoryWith(scratch, { "a.yaml": "1\n" });
  const start = (await plainGit(shared, ["rev-parse", "HEAD"])).trim();
  const folder = join(await scratch.folder(), "run");
  await makeRunCheckout(await testRunner(scratch), {
    shared,
    folder,
    branch: "acme/task-1",
    start,
    remote: "https://example.com/acme/app.git",
  });
  return folder;
}

verifies("git.run-checkout-fence", () => {
  describe("makeRunCheckoutFence", () => {
    it("makes a temp and a cache folder inside the run's folder", async () => {
      const folder = await checkout();
      const fence = await makeRunCheckoutFence(folder);
      expect(fence.tempFolder.startsWith(folder)).toBe(true);
      expect((await stat(fence.tempFolder)).isDirectory()).toBe(true);
      expect(fence.env.TMPDIR).toBe(fence.tempFolder);
      const cache = fence.env.TURBO_CACHE_DIR;
      expect(cache.startsWith(folder)).toBe(true);
      expect((await stat(cache)).isDirectory()).toBe(true);
    });

    it("names the checkout's hooks and config as read-only", async () => {
      const folder = await checkout();
      const fence = await makeRunCheckoutFence(folder);
      expect(fence.readOnlyPaths).toEqual([
        join(folder, ".git", "hooks"),
        join(folder, ".git", "config"),
      ]);
    });

    it("keeps the scratch out of git's status", async () => {
      const folder = await checkout();
      await makeRunCheckoutFence(folder);
      expect(await plainGit(folder, ["status", "--porcelain"])).toBe("");
      expect(await readFile(join(folder, ".git", "info", "exclude"), "utf8")).toContain(
        "/.halonic-run/",
      );
    });

    it("refuses a folder that isn't absolute", async () => {
      await expect(makeRunCheckoutFence("run")).rejects.toThrow("absolute");
    });
  });
});
