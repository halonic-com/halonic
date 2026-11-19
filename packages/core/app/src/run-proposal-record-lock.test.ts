import type { Digest } from "@halonicjs/ports";
import { KeyedQueue } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { ProposalRecordLock } from "./run-proposal-store.ts";
import { RunProposals } from "./run-proposals.ts";
import { proposeRun, setUpProposals } from "./testing/run-proposal-fixtures.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

/** A record lock two services share, as two processes share the lock files; it notes which runs it holds. */
function sharedLock() {
  const queue = new KeyedQueue();
  const held = new Set<string>();
  const lock: ProposalRecordLock = (runId, work) =>
    queue.run(runId, async () => {
      held.add(runId);
      try {
        return await work();
      } finally {
        held.delete(runId);
      }
    });
  return { lock, held };
}

/** A second service on the same records and files, as another process opens them, with the lock. */
function serviceOf(setup: ReturnType<typeof setUpProposals>, recordLock: ProposalRecordLock) {
  return new RunProposals({
    vcs: setup.vcs,
    copies: setup.copies,
    records: setup.records,
    digest,
    clock: setup.clock,
    onEndFailed: () => {},
    store: setup.store,
    trash: setup.trash,
    recordLock,
  });
}

verifies("app.run-proposal-record-lock", () => {
  describe("the host's record lock", () => {
    it("is held for the run whenever the run's record is written or removed", async () => {
      const setup = setUpProposals(digest);
      const { lock, held } = sharedLock();
      const proposals = serviceOf(setup, lock);
      const unlocked: string[] = [];
      const write = setup.records.write.bind(setup.records);
      const remove = setup.records.remove.bind(setup.records);
      const check = (path: string) => {
        if (!held.has(path.replace(/\.json$/u, ""))) {
          unlocked.push(path);
        }
      };
      setup.records.write = (path, ...rest) => {
        check(path);
        return write(path, ...rest);
      };
      setup.records.remove = (path, ...rest) => {
        check(path);
        return remove(path, ...rest);
      };

      await proposeRun({ ...setup, proposals }, "01JD8Q", (files) => {
        files.set("notes/a.md", "A\n");
        files.set("notes/b.md", "B\n");
      });
      await proposals.accept("01JD8Q", { file: "notes/a.md" });
      await proposals.reject("01JD8Q", { file: "notes/b.md" });
      expect(await proposals.settle("01JD8Q")).toBe("settled");

      expect(unlocked).toEqual([]);
    });

    it("keeps both of two decisions made at once by two services on the same records", async () => {
      const setup = setUpProposals(digest);
      const { lock } = sharedLock();
      const first = serviceOf(setup, lock);
      const second = serviceOf(setup, lock);
      await proposeRun({ ...setup, proposals: first }, "01JD8Q", (files) => {
        files.set("notes/a.md", "A\n");
        files.set("notes/b.md", "B\n");
      });

      await Promise.all([
        first.accept("01JD8Q", { file: "notes/a.md" }),
        second.accept("01JD8Q", { file: "notes/b.md" }),
      ]);

      const [record] = await first.list();
      expect(record?.decisions).toEqual({ "notes/a.md": "accepted", "notes/b.md": "accepted" });
    });
  });
});
