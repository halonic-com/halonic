import type { Digest } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { refusalOf } from "./run-proposal-decide.ts";
import { clerk, old, proposeRun, setUpProposals } from "./testing/run-proposal-fixtures.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const smart = "name: Clerk\nmodel: smart\n";
const clerkPath = "agents/clerk.agent.yaml";

/** Run `01JD8Q`: changes the model of `clerk`, adds `notes/today.md` and deletes `old`. */
async function setUpRun() {
  const setup = setUpProposals(digest);
  await proposeRun(setup, "01JD8Q", (files) => {
    files.set(clerkPath, smart);
    files.set("notes/today.md", "Three tickets.\n");
    files.delete("agents/old.agent.yaml");
  });
  return setup;
}

async function decisionsOf(setup: ReturnType<typeof setUpProposals>) {
  return (await setup.proposals.get("01JD8Q"))?.decisions;
}

verifies("app.run-proposal-accept", () => {
  describe("accepting a file whose saved text is still the run's base", () => {
    it("writes the run's text, and Undo brings back the file and undecided", async () => {
      const setup = await setUpRun();
      const result = await setup.proposals.accept("01JD8Q", { file: clerkPath });
      expect(result).toMatchObject({ written: [clerkPath], changedOnDisk: [], refused: [] });
      expect(setup.store.files.get(clerkPath)).toBe(smart);
      expect((await decisionsOf(setup))?.[clerkPath]).toBe("accepted");
      expect(result.undo?.source).toEqual({ kind: "run-proposal", runId: "01JD8Q" });
      expect(result.undo?.files.map((file) => file.path)).toEqual([
        clerkPath,
        ".halonic/proposals/01JD8Q.json",
      ]);

      const undo = result.undo;
      if (undo === null) {
        throw new Error("Accept wrote nothing.");
      }
      expect(await setup.proposals.restore(undo, "before")).toEqual({
        changedOnDisk: [],
        refused: [],
      });
      expect(setup.store.files.get(clerkPath)).toBe(clerk);
      expect((await decisionsOf(setup))?.[clerkPath]).toBe("undecided");
      await setup.proposals.restore(undo, "after");
      expect(setup.store.files.get(clerkPath)).toBe(smart);
      expect((await decisionsOf(setup))?.[clerkPath]).toBe("accepted");
    });

    it("moves a file the run deleted to the trash, and Undo brings it back", async () => {
      const setup = await setUpRun();
      const { undo } = await setup.proposals.accept("01JD8Q", { file: "agents/old.agent.yaml" });
      expect(setup.store.files.has("agents/old.agent.yaml")).toBe(false);
      expect([...setup.trash.entries.values()]).toEqual([
        { path: "agents/old.agent.yaml", content: old },
      ]);
      if (undo === null) {
        throw new Error("Accept wrote nothing.");
      }
      await setup.proposals.restore(undo, "before");
      expect(setup.store.files.get("agents/old.agent.yaml")).toBe(old);
    });

    it("accepts a file already as the run left it without writing it", async () => {
      const setup = await setUpRun();
      setup.store.files.set(clerkPath, smart);
      const result = await setup.proposals.accept("01JD8Q", { file: clerkPath });
      expect(result).toEqual({ undo: null, written: [], changedOnDisk: [], refused: [] });
      expect((await decisionsOf(setup))?.[clerkPath]).toBe("accepted");
    });
  });

  describe("accepting a file the person changed since the run's base", () => {
    it("writes nothing, keeps it undecided and gives the three texts to Compare", async () => {
      const setup = await setUpRun();
      const mine = "name: Clerk\nmodel: local\n";
      setup.store.files.set(clerkPath, mine);
      const result = await setup.proposals.accept("01JD8Q", { file: clerkPath });
      expect(result).toEqual({ undo: null, written: [], changedOnDisk: [clerkPath], refused: [] });
      expect(setup.store.files.get(clerkPath)).toBe(mine);
      expect((await decisionsOf(setup))?.[clerkPath]).toBe("undecided");
      expect(await setup.proposals.compare("01JD8Q", clerkPath)).toEqual({
        base: clerk,
        saved: mine,
        run: smart,
      });
    });

    it("doesn't overwrite a file the person created where the run added one", async () => {
      const setup = await setUpRun();
      setup.store.files.set("notes/today.md", "Mine.\n");
      const result = await setup.proposals.accept("01JD8Q", { file: "notes/today.md" });
      expect(result.changedOnDisk).toEqual(["notes/today.md"]);
      expect(setup.store.files.get("notes/today.md")).toBe("Mine.\n");
    });

    it("writes the others of Accept all as one undo step", async () => {
      const setup = await setUpRun();
      setup.store.files.set(clerkPath, "name: Clerk\nmodel: local\n");
      const result = await setup.proposals.accept("01JD8Q", "all");
      expect(result.written).toEqual(["agents/old.agent.yaml", "notes/today.md"]);
      expect(result.changedOnDisk).toEqual([clerkPath]);
      expect(result.undo?.files).toHaveLength(3);
      expect(await decisionsOf(setup)).toEqual({
        [clerkPath]: "undecided",
        "agents/old.agent.yaml": "accepted",
        "notes/today.md": "accepted",
      });
    });
  });

  describe("undoing after the file changed again", () => {
    it("keeps the person's edit and lists the file", async () => {
      const setup = await setUpRun();
      const { undo } = await setup.proposals.accept("01JD8Q", { file: clerkPath });
      if (undo === null) {
        throw new Error("Accept wrote nothing.");
      }
      setup.store.files.set(clerkPath, "name: Clerk\nmodel: mine\n");
      expect(await setup.proposals.restore(undo, "before")).toEqual({
        changedOnDisk: [clerkPath],
        refused: [],
      });
      expect(setup.store.files.get(clerkPath)).toBe("name: Clerk\nmodel: mine\n");
      expect((await decisionsOf(setup))?.[clerkPath]).toBe("undecided");
    });

    it("refuses a step that isn't a run proposal's", async () => {
      const setup = setUpProposals(digest);
      await expect(
        setup.proposals.restore({ source: { kind: "review" }, files: [] }, "before"),
      ).rejects.toThrow("Only a run proposal's steps can be restored here.");
    });
  });

  describe("a proposal that can't be decided", () => {
    it("refuses a run without a proposal, one whose ref is gone, and a file it doesn't propose", async () => {
      const setup = await setUpRun();
      await expect(setup.proposals.accept("7KQ2MX", "all")).rejects.toThrow(
        "Run 7KQ2MX has no proposal.",
      );
      await expect(setup.proposals.compare("01JD8Q", "README.md")).rejects.toThrow(
        "Run 01JD8Q proposes no change to README.md.",
      );
      setup.vcs.refs.clear();
      await expect(setup.proposals.accept("01JD8Q", "all")).rejects.toThrow(
        "The proposal of run 01JD8Q is unavailable: its texts are gone.",
      );
      await expect(setup.proposals.compare("01JD8Q", clerkPath)).rejects.toThrow(
        "The proposal of run 01JD8Q is unavailable: its texts are gone.",
      );
    });
  });
});

verifies("app.run-proposal-trust", () => {
  describe("accepting a proposal with a file Accept may never write", () => {
    it("refuses .git/hooks/post-checkout, marks it not applicable and writes the rest (HAL-3353)", async () => {
      const setup = setUpProposals(digest);
      await proposeRun(setup, "01JD8Q", (files) => {
        files.set(".git/hooks/post-checkout", "#!/bin/sh\necho planted\n");
        files.set(clerkPath, smart);
      });
      const result = await setup.proposals.accept("01JD8Q", "all");
      expect(result.refused).toEqual([{ path: ".git/hooks/post-checkout", why: "under-git" }]);
      expect(result.written).toEqual([clerkPath]);
      expect(setup.store.files.has(".git/hooks/post-checkout")).toBe(false);
      expect(await decisionsOf(setup)).toEqual({
        ".git/hooks/post-checkout": "not-applicable",
        [clerkPath]: "accepted",
      });
    });

    it.each([".halonic/review/files/0123abcd.json", ".Halonic/review/files/0123abcd.json"])(
      "refuses %s, a planted record of a change to review (HAL-3353)",
      async (planted) => {
        const setup = setUpProposals(digest);
        await proposeRun(setup, "01JD8Q", (files) => {
          files.set(planted, '{"path":"agents/clerk.agent.yaml","baseline":""}\n');
        });
        const result = await setup.proposals.accept("01JD8Q", "all");
        expect(result.refused).toEqual([{ path: planted, why: "under-halonic" }]);
        expect(result.written).toEqual([]);
        expect(setup.store.files.has(planted)).toBe(false);
        expect([...setup.records.files.keys()].filter((path) => path.includes("review"))).toEqual(
          [],
        );
      },
    );

    it("refuses a file the store won't serve, such as one through a symlink", async () => {
      const setup = setUpProposals(digest);
      await proposeRun(setup, "01JD8Q", (files) => files.set("notes/link/today.md", "x\n"));
      const read = setup.store.read.bind(setup.store);
      setup.store.read = async (path) => {
        if (path.startsWith("notes/link/")) {
          throw new RangeError(`Private workspace path ${JSON.stringify(path)}`);
        }
        return await read(path);
      };
      const result = await setup.proposals.accept("01JD8Q", "all");
      expect(result.refused).toEqual([{ path: "notes/link/today.md", why: "outside-workspace" }]);
      expect(setup.store.files.has("notes/link/today.md")).toBe(false);
    });

    it.each([
      [".git/hooks/post-checkout", "under-git"],
      [".GIT./config", "under-git"],
      [".Halonic./proposals/x.json", "under-halonic"],
      ["hubs/h/.halonic/x", "under-halonic"],
      ["GIT~1/hooks/x", "outside-workspace"],
      [".env", "outside-workspace"],
      ["agents/clerk.agent.yaml", null],
    ])("tells why %s can't be written", (path, why) => {
      expect(refusalOf(path)).toBe(why);
    });
  });

  describe("undoing or redoing a step Accept didn't build", () => {
    it.each(["before", "after"] as const)(
      "refuses a crafted step's .git hook and another run's record, to %s",
      async (to) => {
        const setup = await setUpRun();
        const hook = ".git/hooks/post-checkout";
        const otherRecord = ".halonic/proposals/7KQ2MX.json";
        // Each entry goes from no file to a planted one, whichever way it is restored.
        const planted = (path: string, text: string) =>
          to === "after"
            ? { path, before: null, after: text }
            : { path, before: text, after: null };
        const result = await setup.proposals.restore(
          {
            source: { kind: "run-proposal", runId: "01JD8Q" },
            files: [planted(hook, "#!/bin/sh\necho planted\n"), planted(otherRecord, "{}")],
          },
          to,
        );
        expect(result).toEqual({
          changedOnDisk: [],
          refused: expect.arrayContaining([
            { path: hook, why: "under-git" },
            { path: otherRecord, why: "under-halonic" },
          ]),
        });
        expect(result.refused).toHaveLength(2);
        expect(setup.store.files.has(hook)).toBe(false);
        expect(setup.store.files.has(otherRecord)).toBe(false);
        expect(setup.records.files.size).toBe(1);
      },
    );
  });
});

verifies("app.run-proposal-reject", () => {
  describe("rejecting", () => {
    it("leaves the saved file alone, and Undo makes it undecided again", async () => {
      const setup = await setUpRun();
      const { undo } = await setup.proposals.reject("01JD8Q", { file: clerkPath });
      expect(setup.store.files.get(clerkPath)).toBe(clerk);
      expect((await decisionsOf(setup))?.[clerkPath]).toBe("rejected");
      expect(undo.files.map((file) => file.path)).toEqual([".halonic/proposals/01JD8Q.json"]);
      await setup.proposals.restore(undo, "before");
      expect((await decisionsOf(setup))?.[clerkPath]).toBe("undecided");
    });

    it("rejects only the undecided files of Reject all", async () => {
      const setup = await setUpRun();
      await setup.proposals.accept("01JD8Q", { file: clerkPath });
      await setup.proposals.reject("01JD8Q", "all");
      expect(await decisionsOf(setup)).toEqual({
        [clerkPath]: "accepted",
        "agents/old.agent.yaml": "rejected",
        "notes/today.md": "rejected",
      });
      expect(setup.store.files.get(clerkPath)).toBe(smart);
      expect((await setup.proposals.reject("01JD8Q", "all")).undo.files).toEqual([]);
    });
  });
});
