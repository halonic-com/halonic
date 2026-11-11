import type { Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { InFileResult, ProposalFileParts, UndoStep } from "./run-proposal-types.ts";
import { proposeRun, setUpProposals } from "./testing/run-proposal-fixtures.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const path = "agents/triage.agent.yaml";
const before = "# Sorts tickets.\nname: Triage\ndescription: Sorts\nmodel: small # cheap is fine\n";
const byRun =
  "# Sorts tickets.\nname: Ticket triage\ndescription: Sorts\nmodel: large # cheap is fine\n";
/** `before` with only the run's model: what accepting the model change leaves. */
const modelOnly =
  "# Sorts tickets.\nname: Triage\ndescription: Sorts\nmodel: large # cheap is fine\n";
/** `before` with only the run's name. */
const nameOnly =
  "# Sorts tickets.\nname: Ticket triage\ndescription: Sorts\nmodel: small # cheap is fine\n";

/** Run `01JD8Q`: renames agent `triage` and changes its model, two parts apart; adds `notes/today.md`. */
async function setUpRun() {
  const setup = setUpProposals(digest, { [path]: before });
  await proposeRun(setup, "01JD8Q", (files) => {
    files.set(path, byRun);
    files.set("notes/today.md", "Three tickets.\n");
  });
  const partsOf = async (): Promise<ProposalFileParts> => {
    const parts = await setup.proposals.parts("01JD8Q", path);
    if (parts === null) {
      throw new Error("No parts to decide.");
    }
    return parts;
  };
  const decisionOf = async () => (await setup.proposals.get("01JD8Q"))?.decisions[path];
  return { ...setup, partsOf, decisionOf };
}

function undoOf(result: InFileResult): UndoStep {
  if (result.status !== "done" || result.undo === null) {
    throw new Error(`Nothing to undo: ${result.status}.`);
  }
  return result.undo;
}

verifies("app.run-proposal-accept-reject-part", () => {
  describe("accepting one part", () => {
    it("writes it to the saved file and leaves the other part to decide", async () => {
      const setup = await setUpRun();
      const parts = await setup.partsOf();
      expect(parts.parts).toHaveLength(2);

      const result = await setup.proposals.acceptInFile("01JD8Q", {
        kind: "part",
        file: path,
        part: 0,
        seen: parts.seen,
      });
      expect(result).toMatchObject({ status: "done", written: [path], changedOnDisk: [] });
      expect(setup.store.files.get(path)).toBe(nameOnly);
      expect(await setup.decisionOf()).toBe("undecided");
      const left = await setup.partsOf();
      expect(left.parts.map((part) => part.added)).toEqual([["model: large # cheap is fine\n"]]);

      await setup.proposals.restore(undoOf(result), "before");
      expect(setup.store.files.get(path)).toBe(before);
      expect((await setup.partsOf()).parts).toHaveLength(2);
    });

    it("accepts the file once the last part is accepted", async () => {
      const setup = await setUpRun();
      for (const _part of [0, 1]) {
        const { seen } = await setup.partsOf();
        await setup.proposals.acceptInFile("01JD8Q", { kind: "part", file: path, part: 0, seen });
      }
      expect(setup.store.files.get(path)).toBe(byRun);
      expect(await setup.decisionOf()).toBe("accepted");
      expect((await setup.proposals.get("01JD8Q"))?.partly).toBeUndefined();
    });

    it("answers stale on a list from before another decision", async () => {
      const setup = await setUpRun();
      const { seen } = await setup.partsOf();
      await setup.proposals.acceptInFile("01JD8Q", { kind: "part", file: path, part: 0, seen });
      const again = await setup.proposals.acceptInFile("01JD8Q", {
        kind: "part",
        file: path,
        part: 1,
        seen,
      });
      expect(again).toEqual({ status: "stale", path });
      expect(setup.store.files.get(path)).toBe(nameOnly);
    });

    it("writes nothing when the person changed the file since the run started", async () => {
      const setup = await setUpRun();
      const { seen } = await setup.partsOf();
      setup.store.files.set(path, `${before}# mine\n`);
      expect(await setup.proposals.parts("01JD8Q", path)).toBeNull();
      const result = await setup.proposals.acceptInFile("01JD8Q", {
        kind: "part",
        file: path,
        part: 0,
        seen,
      });
      expect(result).toMatchObject({ status: "done", written: [], changedOnDisk: [path] });
      expect(setup.store.files.get(path)).toBe(`${before}# mine\n`);
    });

    it("decides a file the run added as a whole", async () => {
      const setup = await setUpRun();
      expect(await setup.proposals.parts("01JD8Q", "notes/today.md")).toBeNull();
      const result = await setup.proposals.acceptInFile("01JD8Q", {
        kind: "part",
        file: "notes/today.md",
        part: 0,
        seen: "",
      });
      expect(result).toMatchObject({ status: "cant-separate", path: "notes/today.md" });
    });
  });

  describe("rejecting one part", () => {
    it("leaves the saved file alone and takes the part out of the run's text", async () => {
      const setup = await setUpRun();
      const { seen } = await setup.partsOf();
      const result = await setup.proposals.rejectInFile("01JD8Q", {
        kind: "part",
        file: path,
        part: 0,
        seen,
      });
      expect(result).toMatchObject({ status: "done", written: [] });
      expect(undoOf(result).files.map((file) => file.path)).toEqual([
        ".halonic/proposals/01JD8Q.json",
      ]);
      expect(setup.store.files.get(path)).toBe(before);
      expect(await setup.proposals.compare("01JD8Q", path)).toEqual({
        base: before,
        saved: before,
        run: modelOnly,
      });
    });

    it("accepts the file with the parts the person kept, once none is left", async () => {
      const setup = await setUpRun();
      const first = await setup.partsOf();
      await setup.proposals.acceptInFile("01JD8Q", {
        kind: "part",
        file: path,
        part: 0,
        seen: first.seen,
      });
      const second = await setup.partsOf();
      await setup.proposals.rejectInFile("01JD8Q", {
        kind: "part",
        file: path,
        part: 0,
        seen: second.seen,
      });
      expect(setup.store.files.get(path)).toBe(nameOnly);
      expect(await setup.decisionOf()).toBe("accepted");
    });

    it("rejects the file when every part is rejected", async () => {
      const setup = await setUpRun();
      for (const _part of [0, 1]) {
        const { seen } = await setup.partsOf();
        await setup.proposals.rejectInFile("01JD8Q", { kind: "part", file: path, part: 0, seen });
      }
      expect(setup.store.files.get(path)).toBe(before);
      expect(await setup.decisionOf()).toBe("rejected");
    });
  });

  describe("deciding the rest of a partly decided file as a whole", () => {
    it("writes what is left of the run's text", async () => {
      const setup = await setUpRun();
      const { seen } = await setup.partsOf();
      await setup.proposals.rejectInFile("01JD8Q", { kind: "part", file: path, part: 0, seen });
      const result = await setup.proposals.accept("01JD8Q", { file: path });
      expect(result.written).toEqual([path]);
      expect(setup.store.files.get(path)).toBe(modelOnly);
      expect(await setup.decisionOf()).toBe("accepted");
    });

    it("accepts the file on Reject when a part of it was accepted", async () => {
      const setup = await setUpRun();
      const { seen } = await setup.partsOf();
      await setup.proposals.acceptInFile("01JD8Q", { kind: "part", file: path, part: 0, seen });
      await setup.proposals.reject("01JD8Q", { file: path });
      expect(setup.store.files.get(path)).toBe(nameOnly);
      expect(await setup.decisionOf()).toBe("accepted");
      expect((await setup.proposals.get("01JD8Q"))?.partly).toBeUndefined();
    });
  });
});

verifies("app.run-proposal-accept-reject-change", () => {
  describe("one change on an item page", () => {
    it("accepts the model change, keeping the comment, and leaves the name", async () => {
      const setup = await setUpRun();
      const { seen } = await setup.partsOf();
      const result = await setup.proposals.acceptInFile("01JD8Q", {
        kind: "change",
        file: path,
        parts: [["model"]],
        seen,
      });
      expect(result).toMatchObject({ status: "done", written: [path] });
      expect(setup.store.files.get(path)).toBe(modelOnly);
      expect((await setup.partsOf()).run).toBe(byRun);
    });

    it("rejects the model change, leaving the saved file and the name", async () => {
      const setup = await setUpRun();
      const { seen } = await setup.partsOf();
      await setup.proposals.rejectInFile("01JD8Q", {
        kind: "change",
        file: path,
        parts: [["model"]],
        seen,
      });
      expect(setup.store.files.get(path)).toBe(before);
      expect((await setup.partsOf()).run).toBe(nameOnly);
    });

    it("can't decide a change with no item paths on its own", async () => {
      const setup = await setUpRun();
      const { seen } = await setup.partsOf();
      const result = await setup.proposals.acceptInFile("01JD8Q", {
        kind: "change",
        file: path,
        parts: [],
        seen,
      });
      expect(result).toMatchObject({ status: "cant-separate", path });
      expect(setup.store.files.get(path)).toBe(before);
    });

    it("answers stale on a change whose item paths change nothing", async () => {
      const setup = await setUpRun();
      const { seen } = await setup.partsOf();
      const result = await setup.proposals.acceptInFile("01JD8Q", {
        kind: "change",
        file: path,
        parts: [["description"]],
        seen,
      });
      expect(result).toEqual({ status: "stale", path });
      expect(setup.store.files.get(path)).toBe(before);
    });
  });
});
