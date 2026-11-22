import type { Digest, ExpectedContent } from "@halonicjs/ports";
import { contentDigest } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { clerk, old, proposeRun, setUpProposals } from "./testing/run-proposal-fixtures.ts";
import { CannotCombineError } from "./workspace-compare.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const clerkPath = "agents/clerk.agent.yaml";
const oldPath = "agents/old.agent.yaml";
const smart = "name: Clerk\nmodel: smart\n";
/** The person's text: they renamed `clerk` after run `01JD8Q` started. */
const renamed = "name: Front desk\nmodel: fast\n";

const deskPath = "agents/desk.agent.yaml";
/** `desk.agent.yaml` at the run's version: its name and model are lines apart, so both can change. */
const desk = "name: Desk\nrole: triage\ntone: calm\nmodel: fast\n";

/**
 * Run `01JD8Q` changes the model of `clerk` and `desk` and deletes `old`;
 * the person then renames `clerk`.
 */
async function setUpChangedSinceRun() {
  const setup = setUpProposals(digest, { [deskPath]: desk });
  await proposeRun(setup, "01JD8Q", (files) => {
    files.set(clerkPath, smart);
    files.set(deskPath, desk.replace("model: fast", "model: smart"));
    files.delete(oldPath);
  });
  setup.store.files.set(clerkPath, renamed);
  return setup;
}

/** What Compare showed for a saved text: its digest. */
function seenOf(text: string): Promise<ExpectedContent> {
  return contentDigest(text, digest);
}

async function decisionOf(setup: ReturnType<typeof setUpProposals>, path: string) {
  return (await setup.proposals.get("01JD8Q"))?.decisions[path];
}

verifies("app.run-proposal-compare-choice", () => {
  describe("Use the run's", () => {
    it("writes the run's text as one undo step, and Undo brings back the person's", async () => {
      const setup = await setUpChangedSinceRun();
      const result = await setup.proposals.choose(
        "01JD8Q",
        clerkPath,
        "use-run",
        await seenOf(renamed),
      );
      expect(result).toMatchObject({ written: [clerkPath], changedOnDisk: [], refused: [] });
      expect(setup.store.files.get(clerkPath)).toBe(smart);
      expect(await decisionOf(setup, clerkPath)).toBe("accepted");

      if (result.undo === null) {
        throw new Error("Use the run's wrote nothing.");
      }
      await setup.proposals.restore(result.undo, "before");
      expect(setup.store.files.get(clerkPath)).toBe(renamed);
      expect(await decisionOf(setup, clerkPath)).toBe("undecided");
    });

    it("moves a file the run deleted to the trash", async () => {
      const setup = await setUpChangedSinceRun();
      const edited = `${old}note: keep\n`;
      setup.store.files.set(oldPath, edited);
      await setup.proposals.choose("01JD8Q", oldPath, "use-run", await seenOf(edited));
      expect(setup.store.files.has(oldPath)).toBe(false);
      expect([...setup.trash.entries.values()]).toEqual([{ path: oldPath, content: edited }]);
    });
  });

  describe("Combine both", () => {
    it("writes the person's name with the run's model", async () => {
      const setup = await setUpChangedSinceRun();
      const mine = desk.replace("name: Desk", "name: Front desk");
      setup.store.files.set(deskPath, mine);
      await setup.proposals.choose("01JD8Q", deskPath, "combine-both", await seenOf(mine));
      expect(setup.store.files.get(deskPath)).toBe(
        "name: Front desk\nrole: triage\ntone: calm\nmodel: smart\n",
      );
      expect(await decisionOf(setup, deskPath)).toBe("accepted");
    });

    it("refuses when both change the same lines, and writes nothing", async () => {
      const setup = await setUpChangedSinceRun();
      const local = "name: Clerk\nmodel: local\n";
      setup.store.files.set(clerkPath, local);
      await expect(
        setup.proposals.choose("01JD8Q", clerkPath, "combine-both", await seenOf(local)),
      ).rejects.toBeInstanceOf(CannotCombineError);
      expect(setup.store.files.get(clerkPath)).toBe(local);
      expect(await decisionOf(setup, clerkPath)).toBe("undecided");
    });
  });

  describe("a file that changed again after Compare", () => {
    it("writes nothing and keeps it undecided under changedOnDisk", async () => {
      const setup = await setUpChangedSinceRun();
      const seen = await seenOf(renamed);
      const again = "name: Front desk\nmodel: fast\nnote: later\n";
      setup.store.files.set(clerkPath, again);
      const result = await setup.proposals.choose("01JD8Q", clerkPath, "use-run", seen);
      expect(result).toEqual({ undo: null, written: [], changedOnDisk: [clerkPath], refused: [] });
      expect(setup.store.files.get(clerkPath)).toBe(again);
      expect(await decisionOf(setup, clerkPath)).toBe("undecided");
    });
  });

  describe("a file that isn't for Compare", () => {
    it("refuses a decided file and writes nothing", async () => {
      const setup = await setUpChangedSinceRun();
      await setup.proposals.reject("01JD8Q", { file: clerkPath });
      await expect(
        setup.proposals.choose("01JD8Q", clerkPath, "use-run", await seenOf(renamed)),
      ).rejects.toThrow("already decided");
      expect(setup.store.files.get(clerkPath)).toBe(renamed);
    });

    it("refuses a file the run doesn't propose", async () => {
      const setup = await setUpChangedSinceRun();
      await expect(
        setup.proposals.choose("01JD8Q", "README.md", "use-run", await seenOf("# Acme\n")),
      ).rejects.toThrow("proposes no change");
    });

    it("leaves the person's text alone while it is still the run's base for Accept", async () => {
      const setup = await setUpChangedSinceRun();
      setup.store.files.set(clerkPath, clerk);
      const result = await setup.proposals.choose(
        "01JD8Q",
        clerkPath,
        "use-run",
        await seenOf(clerk),
      );
      expect(result.written).toEqual([clerkPath]);
      expect(setup.store.files.get(clerkPath)).toBe(smart);
    });
  });
});
