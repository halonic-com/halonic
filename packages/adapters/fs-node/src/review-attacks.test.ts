// The attack tests of HAL-3353 that need a real folder: the assistant's
// writes through a planted symlink or a `..` path never reach `.git/`, and a
// change to review starts nothing (HAL-65 section F, rule A and condition 5).
// The cases a memory store can show are in `@halonicjs/app`'s
// `review-attacks.test.ts`.

import { lstat, readdir, readFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { ReviewService } from "@halonicjs/app";
import type { Digest, WorkspaceFileChange } from "@halonicjs/ports";
import { contentDigest } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FolderDefinitionStore } from "./definition-store.ts";
import type { FolderEvents } from "./folder-watch.ts";
import { removeTempFolders, tempFolder, writeFiles } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const hook = "#!/bin/sh\nexit 0\n";
const clerk = "agents/clerk.agent.yaml";
const fast = "name: Clerk\nmodel: fast\n";
const k1 = { chatId: "c1", cardId: "k1" };

/** A workspace folder with a git hook and an agent, and its review service on real folders. */
async function workspace(options: { trusted: boolean; events?: FolderEvents }) {
  const root = await tempFolder();
  await writeFiles(root, { ".git/hooks/pre-commit": hook, [clerk]: fast });
  const recordsRoot = await tempFolder();
  const store = new FolderDefinitionStore(
    root,
    undefined,
    options.events === undefined ? {} : { events: options.events, quietMs },
  );
  const review = new ReviewService({
    store,
    records: new FolderDefinitionStore(recordsRoot),
    digest,
    isTrusted: () => options.trusted,
  });
  return { root, recordsRoot, store, review };
}

/** Writes a new file the way `propose_file` does. */
function proposeNew(review: ReviewService, path: string) {
  return review.propose({ path, content: "planted\n", expected: "absent", card: k1 });
}

/** The files under `root`, `.git/` included, sorted. */
async function filesUnder(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => !entry.isDirectory())
    .map((entry) =>
      join(entry.parentPath, entry.name)
        .slice(root.length + 1)
        .replaceAll("\\", "/"),
    )
    .sort();
}

/**
 * Checks the hook is untouched and nothing new was written in the workspace
 * or the records. `link`, the planted link, and what it lists are left out.
 */
async function expectNothingWritten(root: string, recordsRoot: string, link = ""): Promise<void> {
  expect(await readFile(join(root, ".git/hooks/pre-commit"), "utf8")).toBe(hook);
  const files = await filesUnder(root);
  expect(
    files.filter((path) => link === "" || (path !== link && !path.startsWith(`${link}/`))),
  ).toEqual([".git/hooks/pre-commit", clerk]);
  expect(await filesUnder(recordsRoot)).toEqual([]);
}

verifies("app.assistant-no-git-or-halonic", () => {
  // A2: the store refuses the link, and the service turns that into a refusal.
  for (const trusted of [true, false]) {
    describe(trusted ? "trusted" : "untrusted", () => {
      it("refuses a write through a planted link to .git/hooks", async () => {
        const { root, recordsRoot, review } = await workspace({ trusted });
        await symlink(join(root, ".git/hooks"), join(root, "hooks-link"), "dir");
        const outcome = await proposeNew(review, "hooks-link/pre-commit");
        expect(outcome).toEqual({
          status: "refused",
          reason: trusted ? "not-allowed" : "untrusted",
        });
        await expectNothingWritten(root, recordsRoot, "hooks-link");
      });

      it("refuses an item path whose folder is a link to .git/hooks", async () => {
        const { root, recordsRoot, review } = await workspace({ trusted });
        await symlink(join(root, ".git/hooks"), join(root, "workflows"), "dir");
        const outcome = await proposeNew(review, "workflows/pre-commit.workflow.yaml");
        expect(outcome).toEqual({ status: "refused", reason: "not-allowed" });
        expect((await lstat(join(root, "workflows"))).isSymbolicLink()).toBe(true);
        expect(await readdir(join(root, ".git/hooks"))).toEqual(["pre-commit"]);
        await expectNothingWritten(root, recordsRoot, "workflows");
      });

      it("refuses an item file that is a link to a hook", async () => {
        const { root, recordsRoot, review } = await workspace({ trusted });
        const linked = "agents/hook.agent.yaml";
        await symlink(join(root, ".git/hooks/pre-commit"), join(root, linked));
        const outcome = await review.propose({
          path: linked,
          content: "planted\n",
          expected: await contentDigest(hook, digest),
          card: k1,
        });
        expect(outcome).toEqual({ status: "refused", reason: "not-allowed" });
        expect(await readFile(join(root, ".git/hooks/pre-commit"), "utf8")).toBe(hook);
        expect(await filesUnder(recordsRoot)).toEqual([]);
      });

      it.each(["a/../.git/hooks/pre-commit", "agents/../.git/hooks/pre-commit"])(
        "refuses %j",
        async (path) => {
          const { root, recordsRoot, review } = await workspace({ trusted });
          const outcome = await proposeNew(review, path);
          expect(outcome).toEqual({
            status: "refused",
            reason: trusted ? "not-allowed" : "untrusted",
          });
          await expectNothingWritten(root, recordsRoot);
        },
      );
    });
  }
});

const quietMs = 100;

/** Folder events a test sends by hand, in place of `node:fs.watch`. */
function handEvents(): { events: FolderEvents; notice: (...names: string[]) => void } {
  let noticed: (name: string) => void = () => {};
  return {
    events: (_root, onNoticed) => {
      noticed = onNoticed;
      return () => {
        noticed = () => {};
      };
    },
    notice: (...names) => {
      for (const name of names) noticed(name);
    },
  };
}

verifies("app.review-starts-nothing", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // R2: routine triggers and the preview hear about files through the watch.
  it("reports no watch batch for a write, an Accept or a Reject", async () => {
    const hand = handEvents();
    const { root, store, review } = await workspace({ trusted: true, events: hand.events });
    const batches: (readonly WorkspaceFileChange[])[] = [];
    const watch = await store.watch({
      changed: (changes) => batches.push(changes),
      failed: () => {},
    });
    const smart = "name: Clerk\nmodel: smart\n";
    await review.propose({
      path: clerk,
      content: smart,
      expected: await contentDigest(fast, digest),
      card: k1,
    });
    await proposeNew(review, "routines/nightly.routine.yaml");
    await review.reject({ kind: "file", path: clerk });
    await review.accept({ kind: "file", path: "routines/nightly.routine.yaml" });
    hand.notice(clerk, "routines/nightly.routine.yaml");
    await vi.advanceTimersByTimeAsync(quietMs);
    await watch.close();
    expect(batches).toEqual([]);
    expect(await readFile(join(root, clerk), "utf8")).toBe(fast);
  });
});
