import type { Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { UndoStep } from "./run-proposal-types.ts";
import { clerk, old, proposeRun, setUpProposals } from "./testing/run-proposal-fixtures.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const smart = "name: Clerk\nmodel: smart\n";
const clerkPath = "agents/clerk.agent.yaml";
const oldPath = "agents/old.agent.yaml";
const notesPath = "notes/today.md";
const recordPath = ".halonic/proposals/01JD8Q.json";

/** Run `01JD8Q`: changes the model of `clerk`, adds `notes/today.md` and deletes `old`. */
async function setUpRun() {
  const setup = setUpProposals(digest);
  await proposeRun(setup, "01JD8Q", (files) => {
    files.set(clerkPath, smart);
    files.set(notesPath, "Three tickets.\n");
    files.delete(oldPath);
  });
  return setup;
}

async function decisionsOf(setup: ReturnType<typeof setUpProposals>) {
  return (await setup.proposals.get("01JD8Q"))?.decisions;
}

function stepOf(undo: UndoStep | null): UndoStep {
  if (undo === null) {
    throw new Error("The decision wrote nothing.");
  }
  return undo;
}

verifies("app.run-proposal-accept", () => {
  describe("undoing a step with a file it can't put back (HAL-16083)", () => {
    it("puts back the others, and the file left alone keeps its decision", async () => {
      const setup = await setUpRun();
      const undo = stepOf((await setup.proposals.accept("01JD8Q", "all")).undo);
      setup.store.files.set(notesPath, "Four tickets.\n");

      expect(await setup.proposals.restore(undo, "before")).toEqual({
        changedOnDisk: [notesPath],
        refused: [],
        decidedAfter: false,
      });
      expect(setup.store.files.get(clerkPath)).toBe(clerk);
      expect(setup.store.files.get(oldPath)).toBe(old);
      expect(setup.store.files.get(notesPath)).toBe("Four tickets.\n");
      expect(await decisionsOf(setup)).toEqual({
        [clerkPath]: "undecided",
        [oldPath]: "undecided",
        [notesPath]: "accepted",
      });
    });

    it("redoes it after that, as no later decision was made", async () => {
      const setup = await setUpRun();
      const undo = stepOf((await setup.proposals.accept("01JD8Q", "all")).undo);
      setup.store.files.set(notesPath, "Four tickets.\n");
      await setup.proposals.restore(undo, "before");

      expect(await setup.proposals.restore(undo, "after")).toEqual({
        changedOnDisk: [notesPath],
        refused: [],
        decidedAfter: false,
      });
      expect(setup.store.files.get(clerkPath)).toBe(smart);
      expect(setup.store.files.has(oldPath)).toBe(false);
      expect(await decisionsOf(setup)).toEqual({
        [clerkPath]: "accepted",
        [oldPath]: "accepted",
        [notesPath]: "accepted",
      });
    });

    it("undoes the step before it after a partial Undo of the later one", async () => {
      const setup = await setUpRun();
      const first = stepOf((await setup.proposals.accept("01JD8Q", { file: clerkPath })).undo);
      const second = stepOf((await setup.proposals.accept("01JD8Q", "all")).undo);
      setup.store.files.set(notesPath, "Four tickets.\n");
      await setup.proposals.restore(second, "before");

      expect(await setup.proposals.restore(first, "before")).toEqual({
        changedOnDisk: [],
        refused: [],
        decidedAfter: false,
      });
      expect(setup.store.files.get(clerkPath)).toBe(clerk);
      expect(await decisionsOf(setup)).toEqual({
        [clerkPath]: "undecided",
        [oldPath]: "undecided",
        [notesPath]: "accepted",
      });
    });
  });

  describe("undoing a step after a later decision (HAL-16083)", () => {
    it("isn't kept from it by a decision on another file of the run, which stays", async () => {
      const setup = await setUpRun();
      const undo = stepOf((await setup.proposals.accept("01JD8Q", { file: clerkPath })).undo);
      await setup.proposals.reject("01JD8Q", { file: notesPath });

      expect(await setup.proposals.restore(undo, "before")).toEqual({
        changedOnDisk: [],
        refused: [],
        decidedAfter: false,
      });
      expect(setup.store.files.get(clerkPath)).toBe(clerk);
      expect(await decisionsOf(setup)).toEqual({
        [clerkPath]: "undecided",
        [oldPath]: "undecided",
        [notesPath]: "rejected",
      });
    });

    it("is kept from it by a later decision on the same file, and says so", async () => {
      const setup = await setUpRun();
      const { undo } = await setup.proposals.reject("01JD8Q", { file: clerkPath });
      await setup.proposals.restore(undo, "before");
      await setup.proposals.accept("01JD8Q", { file: clerkPath });

      expect(await setup.proposals.restore(undo, "after")).toEqual({
        changedOnDisk: [recordPath],
        refused: [],
        decidedAfter: true,
      });
      expect(setup.store.files.get(clerkPath)).toBe(smart);
      expect((await decisionsOf(setup))?.[clerkPath]).toBe("accepted");
    });
  });
});

verifies("app.run-proposal-trust", () => {
  it("refuses to undo a file the store no longer serves, which keeps its decision (HAL-16083)", async () => {
    const setup = await setUpRun();
    const undo = stepOf((await setup.proposals.accept("01JD8Q", "all")).undo);
    // `clerk` became a link out of the workspace after the Accept.
    const linked = (path: string) => {
      if (path === clerkPath) {
        throw new RangeError(`Private workspace path ${JSON.stringify(path)}`);
      }
    };
    const read = setup.store.read.bind(setup.store);
    const write = setup.store.write.bind(setup.store);
    setup.store.read = async (path) => {
      linked(path);
      return await read(path);
    };
    setup.store.write = async (path, content, options) => {
      linked(path);
      return await write(path, content, options);
    };

    expect(await setup.proposals.restore(undo, "before")).toEqual({
      changedOnDisk: [],
      refused: [{ path: clerkPath, why: "outside-workspace" }],
      decidedAfter: false,
    });
    expect(setup.store.files.get(clerkPath)).toBe(smart);
    expect(await decisionsOf(setup)).toEqual({
      [clerkPath]: "accepted",
      [oldPath]: "undecided",
      [notesPath]: "undecided",
    });
  });
});
