import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ChangesList } from "./changes-list.ts";
import { fakeSource, settle } from "./source.test-helper.ts";

const triage = "agents/triage.agent.yaml";

/** A list whose workspace changed the triage agent and the README. */
async function listWithTwoChanges() {
  const fake = fakeSource({
    kind: "ready",
    changes: [
      { path: triage, status: "modified", staged: false },
      { path: "README.md", status: "modified", staged: false },
    ],
  });
  fake.setTexts(triage, { before: "a: 1\n", after: "a: 2\n" });
  fake.setTexts("README.md", { before: "a\n", after: "b\n" });
  const list = new ChangesList(fake.source);
  await settle();
  return { fake, list };
}

/** Whether `answer` has settled yet, and with what. */
async function settledWith<Outcome>(answer: Promise<Outcome>): Promise<Outcome | "waiting"> {
  return Promise.race([answer, settle().then(() => "waiting" as const)]);
}

verifies("source-control.create-version-elsewhere", () => {
  describe("ChangesList opening Create version for another feature", () => {
    it("opens for only the given paths and answers made once the version is created", async () => {
      const { fake, list } = await listWithTwoChanges();
      const answer = list.openVersion([triage]);
      expect(list.state.version).toEqual({ paths: [triage], opener: "elsewhere" });
      expect(list.versionFiles.map((file) => file.path)).toEqual([triage]);
      expect(await settledWith(answer)).toBe("waiting");

      expect(await list.createVersion("Sharper triage", "")).toBeUndefined();
      expect(await answer).toBe("made");
      expect(fake.versions.map((version) => version.paths)).toEqual([[triage]]);
    });

    it("answers cancelled when the dialog closes without a version", async () => {
      const { fake, list } = await listWithTwoChanges();
      const answer = list.openVersion([triage]);
      list.cancelVersion();
      expect(await answer).toBe("cancelled");
      expect(list.state.version).toBeUndefined();
      expect(fake.versions).toEqual([]);
    });

    it("keeps waiting while git refuses, since the dialog stays open", async () => {
      const { fake, list } = await listWithTwoChanges();
      fake.failVersion(new Error("Unable to create index.lock"));
      const answer = list.openVersion([triage]);
      expect(await list.createVersion("x", "")).toBeDefined();
      expect(await settledWith(answer)).toBe("waiting");
    });

    it("answers the one before cancelled when another Create version replaces it", async () => {
      const { list } = await listWithTwoChanges();
      const first = list.openVersion([triage]);
      const second = list.openVersion(["README.md"]);
      expect(await first).toBe("cancelled");
      list.startVersion();
      expect(await second).toBe("cancelled");
      expect(list.state.version?.opener).toBe("page");
    });

    it("answers cancelled at once and opens nothing when the folder has no history", async () => {
      const fake = fakeSource({ kind: "not-a-repository" });
      const list = new ChangesList(fake.source);
      await settle();
      expect(await list.openVersion([triage])).toBe("cancelled");
      expect(list.state.version).toBeUndefined();
    });

    it("closes and answers cancelled when a read finds the history gone", async () => {
      const { fake, list } = await listWithTwoChanges();
      const answer = list.openVersion([triage]);
      fake.answer({ kind: "no-git" });
      await list.refresh();
      expect(await answer).toBe("cancelled");
      expect(list.state.version).toBeUndefined();
    });

    it("answers cancelled when the workspace closes", async () => {
      const { list } = await listWithTwoChanges();
      const answer = list.openVersion([triage]);
      list.dispose();
      expect(await answer).toBe("cancelled");
      expect(await list.openVersion([triage])).toBe("cancelled");
    });
  });
});
