import type { Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { clerk, proposeRun, setUpProposals } from "./testing/run-proposal-fixtures.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const clerkPath = "agents/clerk.agent.yaml";
const ref = "refs/halonic/proposals/01JD8Q";
const day = 24 * 60 * 60 * 1000;

/** Run `01JD8Q`: changes the model of `clerk` and adds `notes/today.md`. */
async function setUpRun() {
  const setup = setUpProposals(digest);
  await proposeRun(setup, "01JD8Q", (files) => {
    files.set(clerkPath, "name: Clerk\nmodel: smart\n");
    files.set("notes/today.md", "Three tickets.\n");
  });
  return setup;
}

/** Moves the setup's clock on from the time the run ended. */
function daysLater(setup: Awaited<ReturnType<typeof setUpRun>>, days: number) {
  setup.clock.time = new Date(setup.clock.time.getTime() + days * day);
}

verifies("app.run-proposal-done", () => {
  describe("settling once the toast has gone", () => {
    it("deletes the ref and keeps the record, settled as decided", async () => {
      const setup = await setUpRun();
      await setup.proposals.reject("01JD8Q", "all");
      expect(await setup.proposals.settle("01JD8Q")).toBe("settled");
      expect(setup.vcs.refs.has(ref)).toBe(false);
      const record = await setup.proposals.get("01JD8Q");
      expect(record?.decisions).toEqual({ [clerkPath]: "rejected", "notes/today.md": "rejected" });
      expect(record?.settled).toEqual({ at: "2026-11-11T09:00:00.000Z", why: "decided" });
      expect(await setup.proposals.settle("01JD8Q")).toBe("settled");
    });

    it("leaves the proposal open when an Undo brought a file back", async () => {
      const setup = await setUpRun();
      const { undo } = await setup.proposals.reject("01JD8Q", "all");
      await setup.proposals.restore(undo, "before");
      expect(await setup.proposals.settle("01JD8Q")).toBe("open");
      expect(setup.vcs.refs.has(ref)).toBe(true);
      expect((await setup.proposals.get("01JD8Q"))?.settled).toBeUndefined();
    });

    it("counts a file that may never be written as decided", async () => {
      const setup = setUpProposals(digest);
      await proposeRun(setup, "01JD8Q", (files) => {
        files.set(clerkPath, "name: Clerk\nmodel: smart\n");
        files.set(".git/hooks/post-checkout", "#!/bin/sh\necho planted\n");
      });
      await setup.proposals.accept("01JD8Q", "all");
      expect(await setup.proposals.settle("01JD8Q")).toBe("settled");
    });

    it("takes no further decision or Undo once settled", async () => {
      const setup = await setUpRun();
      const { undo } = await setup.proposals.reject("01JD8Q", "all");
      await setup.proposals.settle("01JD8Q");
      await expect(setup.proposals.restore(undo, "before")).rejects.toThrow(/settled/u);
      await expect(setup.proposals.accept("01JD8Q", "all")).rejects.toThrow(/settled/u);
      expect((await setup.proposals.get("01JD8Q"))?.decisions[clerkPath]).toBe("rejected");
      expect(setup.store.files.get(clerkPath)).toBe(clerk);
    });
  });

  describe("settling after 30 days", () => {
    it("settles an open proposal as expired and leaves its files undecided", async () => {
      const setup = await setUpRun();
      daysLater(setup, 30);
      expect(await setup.proposals.settleExpired()).toEqual(["01JD8Q"]);
      expect(setup.vcs.refs.has(ref)).toBe(false);
      const record = await setup.proposals.get("01JD8Q");
      expect(record?.decisions[clerkPath]).toBe("undecided");
      expect(record?.settled?.why).toBe("expired");
      expect(await setup.proposals.settleExpired()).toEqual([]);
    });

    it("keeps a proposal open for 29 days", async () => {
      const setup = await setUpRun();
      daysLater(setup, 29);
      expect(await setup.proposals.settleExpired()).toEqual([]);
      expect(setup.vcs.refs.has(ref)).toBe(true);
    });

    it("deletes the ref a crash left to a settled proposal", async () => {
      const setup = await setUpRun();
      await setup.proposals.reject("01JD8Q", "all");
      const commit = setup.vcs.refs.get(ref);
      await setup.proposals.settle("01JD8Q");
      // As if Halonic stopped after saving the record and before deleting the ref.
      setup.vcs.refs.set(ref, commit ?? "");
      expect(await setup.proposals.settleExpired()).toEqual([]);
      expect(setup.vcs.refs.has(ref)).toBe(false);
    });
  });
});
