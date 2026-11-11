import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { liveState } from "./live-state.ts";
import { liveVersionOf } from "./live-version.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";
import { TestVersions } from "./testing/test-versions.ts";

const agentPath = "agents/briefing.agent.yaml";
const briefing = "id: briefing\nname: Briefing\nmodel: fast\ninstructions: Brief me.\n";
const routinePath = "workflows/routines/morning.routine.yaml";
const morning = (enabled: boolean) =>
  [
    "id: morning",
    "name: Morning",
    `enabled: ${enabled}`,
    'trigger: { schedule: "0 8 * * *" }',
    "run: { workflow: digest }",
  ].join("\n");

/** The live state of `path`, with these saved files and the versions as they are. */
async function stateOf(versions: TestVersions, saved: Record<string, string>, path: string) {
  const live = await liveVersionOf(versions);
  return liveState({ live, vcs: versions, saved: new TestDefinitionStore(saved) }, path);
}

verifies("app.live-state", () => {
  describe("liveState", () => {
    it("is never-versioned for an item no version has", async () => {
      const versions = new TestVersions();
      expect(await stateOf(versions, { [agentPath]: briefing }, agentPath)).toEqual({
        state: "never-versioned",
      });

      versions.commit({ "workspace.yaml": "id: acme\n" });
      expect(await stateOf(versions, { [agentPath]: briefing }, agentPath)).toEqual({
        state: "never-versioned",
      });
    });

    it("is live for an item saved as the live version has it", async () => {
      const versions = new TestVersions();
      versions.commit({ [agentPath]: briefing });

      expect(await stateOf(versions, { [agentPath]: briefing }, agentPath)).toEqual({
        state: "live",
      });
    });

    it("is not live after a saved change, since the live version's date", async () => {
      const versions = new TestVersions();
      versions.commit({ [agentPath]: briefing }, "2026-11-11T10:42:00Z");
      const changed = briefing.replace("Brief me.", "Brief me in three lines.");

      expect(await stateOf(versions, { [agentPath]: changed }, agentPath)).toEqual({
        state: "not-live",
        since: "2026-11-11T10:42:00Z",
      });
    });

    it("compares the item, not its comments or layout", async () => {
      const versions = new TestVersions();
      versions.commit({ [agentPath]: briefing });
      const relaidOut = `# The morning briefing\nname: Briefing\nid: briefing\nmodel:   fast\ninstructions: "Brief me."\n`;

      expect(await stateOf(versions, { [agentPath]: relaidOut }, agentPath)).toEqual({
        state: "live",
      });
    });

    it("leaves out the fields that act at once, such as a routine's enabled", async () => {
      const versions = new TestVersions();
      versions.commit({ [routinePath]: morning(true) });

      expect(await stateOf(versions, { [routinePath]: morning(false) }, routinePath)).toEqual({
        state: "live",
      });
      const renamed = morning(false).replace("name: Morning", "name: Early");
      expect(await stateOf(versions, { [routinePath]: renamed }, routinePath)).toMatchObject({
        state: "not-live",
      });
    });

    it("is not live for a deleted item the live version still has", async () => {
      const versions = new TestVersions();
      versions.commit({ [agentPath]: briefing });

      expect(await stateOf(versions, {}, agentPath)).toMatchObject({ state: "not-live" });
    });

    it("compares a file that doesn't parse, or isn't an item, as text", async () => {
      const versions = new TestVersions();
      versions.commit({ [agentPath]: "id: [broken\n", "tools/run.sh": "echo 1\n" });

      expect(await stateOf(versions, { [agentPath]: "id: [broken\n" }, agentPath)).toEqual({
        state: "live",
      });
      expect(await stateOf(versions, { [agentPath]: "id: [broken \n" }, agentPath)).toMatchObject({
        state: "not-live",
      });
      expect(await stateOf(versions, { "tools/run.sh": "echo 2\n" }, "tools/run.sh")).toMatchObject(
        { state: "not-live" },
      );
    });

    it("is live for every item with history off, as runs read the saved files", async () => {
      const versions = new TestVersions();
      versions.isRepo = false;

      expect(await stateOf(versions, { [agentPath]: briefing }, agentPath)).toEqual({
        state: "live",
      });
    });

    it("refuses a private path with history on or off", async () => {
      const versions = new TestVersions();
      versions.commit({ [agentPath]: briefing });
      await expect(stateOf(versions, {}, ".env")).rejects.toThrow(RangeError);

      versions.isRepo = false;
      await expect(stateOf(versions, {}, ".env")).rejects.toThrow(RangeError);
    });
  });
});

verifies("app.live-version", () => {
  describe("liveVersionOf", () => {
    it("is history-off without version control or outside a repository", async () => {
      const versions = new TestVersions();
      versions.isRepo = false;

      expect(await liveVersionOf(null)).toEqual({ kind: "history-off" });
      expect(await liveVersionOf(versions)).toEqual({ kind: "history-off" });
    });

    it("is none-yet in a repository without a commit", async () => {
      expect(await liveVersionOf(new TestVersions())).toEqual({ kind: "none-yet" });
    });

    it("is the latest commit", async () => {
      const versions = new TestVersions();
      versions.commit({ [agentPath]: briefing });
      const latest = versions.commit({ [agentPath]: briefing.replace("fast", "smart") });

      expect(await liveVersionOf(versions)).toEqual({ kind: "commit", commit: latest });
    });
  });
});
